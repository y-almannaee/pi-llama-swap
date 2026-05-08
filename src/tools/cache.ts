import {
  RawModel,
  RunningEndpoint,
  RunningEntry,
} from "../interfaces/endpoints/models";
import {
  fetchUpstreamMeta,
  listModels,
  listRunningModels,
} from "./retriever";

/** How long cached models are considered fresh (5 minutes) */
const FRESHNESS_MS = 5 * 60 * 1000;

/** Upstream metadata fetch — retry settings */
const UPSTREAM_RETRY_MAX = 5;
const UPSTREAM_RETRY_BASE_MS = 2_000;
const UPSTREAM_RETRY_MAX_MS = 30_000;

interface CacheEntry {
  data: RawModel[];
  fetchedAt: number;
}

/** Cached models — stale-while-revalidate pattern */
let cache: CacheEntry | null = null;

/** Whether a background refresh is in progress */
let refreshing = false;

/** Currently active/selected model ID (set when user picks a model) */
let activeModelId: string | null = null;

/**
 * Cached /running response — populated on first call, refreshed periodically.
 */
let runningCache: RunningEntry[] | null = null;

/**
 * Returns cached models instantly. If stale, triggers a background refresh.
 * Never blocks or throws — always returns data or empty array.
 */
export async function getModels(): Promise<RawModel[]> {
  if (cache?.data.length) {
    const isStale = Date.now() - cache.fetchedAt > FRESHNESS_MS;
    if (isStale && !refreshing) {
      void refreshBackground();
    }
    return cache.data;
  }

  return fetchFresh();
}

/**
 * Forces a fresh fetch (blocks until complete).
 * Used at startup when freshness matters.
 */
export async function fetchFresh(): Promise<RawModel[]> {
  try {
    const models = await listModels();
    cache = { data: models, fetchedAt: Date.now() };
    return models;
  } catch {
    if (cache?.data.length) {
      return cache.data;
    }
    return [];
  }
}

/**
 * Background refresh — updates cache without blocking the caller.
 * Silently swallows errors so stale data keeps working.
 */
async function refreshBackground(): Promise<void> {
  refreshing = true;
  try {
    const models = await listModels();
    cache = { data: models, fetchedAt: Date.now() };
  } catch {
    // Keep serving stale data
  } finally {
    refreshing = false;
  }
}

/**
 * Resets the cache (useful for testing).
 */
export function resetCache(): void {
  cache = null;
  refreshing = false;
  activeModelId = null;
  runningCache = null;
}

/**
 * Sets the currently active/selected model ID.
 * Used to trigger upstream metadata fetch for only the selected model.
 */
export function setActiveModel(modelId: string): void {
  activeModelId = modelId;
}

/**
 * Returns the currently active model ID, or null if none selected.
 */
export function getActiveModelId(): string | null {
  return activeModelId;
}

/**
 * Extracts the base ID (before any colon suffix) from a model ID.
 * Used for matching running models against variants.
 */
function extractBaseId(modelId: string): string {
  return modelId.includes(":") ? modelId.split(":")[0] : modelId;
}

/**
 * Fetches and caches the /running response.
 */
export async function fetchRunningState(): Promise<RunningEntry[]> {
  if (runningCache) return runningCache;
  try {
    const data = await listRunningModels();
    runningCache = data.running;
    return runningCache;
  } catch {
    // /running unavailable — return empty array (safe degradation)
    return [];
  }
}

/**
 * Merges running state into the cached model entries.
 *
 * Matches running entries by base ID — if the running model is
 * "Qwen3.6-27B-Q4_K_M-ik-mtp", all variants like ":general", ":precise"
 * are also marked as running (they share the same upstream process).
 */
export function mergeRunningState(models: RawModel[], entries: RunningEntry[]): void {
  // Build a set of running base IDs
  const runningBaseIds = new Map<string, RunningEntry>();
  for (const entry of entries) {
    if (entry.model) {
      const baseId = extractBaseId(entry.model);
      runningBaseIds.set(baseId, entry);
    }
  }

  // Merge into model entries
  for (const m of models) {
    const baseId = extractBaseId(m.id);
    const entry = runningBaseIds.get(baseId);
    if (entry) {
      m.meta ??= {};
      m.meta.llamaswap ??= {};
      m.meta.llamaswap.isRunning = true;
      m.meta.llamaswap.runningState = entry.state;
      m.meta.llamaswap.runningTtl = entry.ttl;
      // Store cmd for info display
      if (entry.cmd) {
        m.meta.llamaswap.runningCmd = entry.cmd;
      }
    } else {
      // Explicitly mark as not running (clears stale state)
      m.meta ??= {};
      m.meta.llamaswap ??= {};
      m.meta.llamaswap.isRunning = false;
      m.meta.llamaswap.runningState = undefined;
      m.meta.llamaswap.runningTtl = undefined;
      m.meta.llamaswap.runningCmd = undefined;
    }
  }
}

/**
 * Returns the running state for a specific model.
 * Checks base ID matching (variants share the same running state).
 */
export function getRunningStateForModel(
  models: RawModel[],
  modelId: string,
): { isRunning: boolean; state?: string; cmd?: string } | null {
  const m = models.find((m) => m.id === modelId);
  if (!m) return null;
  const ls = m.meta?.llamaswap;
  if (!ls) return { isRunning: false };
  const cmd = ls.runningCmd as string | undefined;
  return {
    isRunning: !!ls.isRunning,
    state: ls.runningState,
    cmd,
  };
}

/**
 * Checks if a model is currently running (loaded in llama-swap).
 * Checks base ID matching — variants share the same running state.
 */
export async function isModelRunning(modelId: string): Promise<boolean> {
  const entries = await fetchRunningState();
  const baseId = extractBaseId(modelId);
  return entries.some((e) => extractBaseId(e.model ?? "") === baseId);
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Merges upstream metadata for the currently active model only.
 *
 * Strategy (safe — never triggers a model swap):
 *
 * 1. Check if the active model is currently running (via /running).
 * 2. If running, use /upstream/:model_id/v1/models (proxied, safe since
 *    the model is already loaded).
 * 3. If not running, silently give up — no read-only path exists.
 *    Calling /upstream/:id for a non-running model triggers a swap.
 *
 * ⚠️  /upstream/:model_id is DESTRUCTIVE — it unloads the current model
 * and loads the queried one. NEVER call it for non-running models.
 *
 * Retries with exponential backoff if the upstream is not yet ready
 * (e.g. model is still loading). Silently gives up after max retries.
 *
 * Upstream metadata is merged defensively — captures all numeric fields
 * from the meta block, not just known ik_llama.cpp fields. Different
 * backends (vLLM, llama.cpp, etc.) expose different shapes.
 */
export async function mergeUpstreamMeta(): Promise<void> {
  if (!activeModelId) return;
  if (!cache?.data.length) return;

  const activeModel = cache.data.find((m) => m.id === activeModelId);
  if (!activeModel) return;

  // Check if model is running — only safe to query upstream if it is
  const running = await isModelRunning(activeModelId);
  if (!running) return;

  // Retry with exponential backoff — upstream may still be loading
  for (let attempt = 0; attempt < UPSTREAM_RETRY_MAX; attempt++) {
    const upstreamModel = await fetchUpstreamMeta(activeModelId);

    if (upstreamModel === null) {
      if (attempt < UPSTREAM_RETRY_MAX - 1) {
        const delay = Math.min(
          UPSTREAM_RETRY_BASE_MS * Math.pow(2, attempt),
          UPSTREAM_RETRY_MAX_MS,
        );
        await sleep(delay);
      }
      continue;
    }

    // Merge upstream metadata defensively — capture all numeric fields
    // from the meta block. Different backends (ik_llama.cpp, vLLM, etc.)
    // expose different shapes, so we don't assume a fixed schema.
    if (upstreamModel.meta && typeof upstreamModel.meta === "object") {
      const meta = upstreamModel.meta as Record<string, unknown>;
      const numericFields: Record<string, number> = {};
      for (const [key, val] of Object.entries(meta)) {
        if (typeof val === "number") {
          numericFields[key] = val;
        }
      }
      activeModel.meta = {
        ...activeModel.meta,
        upstream: numericFields,
      };
    }
    if (typeof upstreamModel.max_model_len === "number") {
      activeModel.max_model_len = upstreamModel.max_model_len;
    }

    // Success — stop retrying
    return;
  }
}
