import { RawModel } from "../interfaces/endpoints/models";
import { listModels } from "./retriever";

/** How long cached models are considered fresh (5 minutes) */
const FRESHNESS_MS = 5 * 60 * 1000;

interface CacheEntry {
  data: RawModel[];
  fetchedAt: number;
}

/** Cached models — stale-while-revalidate pattern */
let cache: CacheEntry | null = null;

/** Whether a background refresh is in progress */
let refreshing = false;

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
}

/**
 * Merges upstream metadata into cached models.
 *
 * For each model with an upstream_port in its llama-swap meta,
 * queries the upstream /v1/models and merges any discovered metadata
 * (n_ctx_train, max_model_len, vocab info, etc.) into the model entry.
 *
 * Failures are silent — missing metadata degrades gracefully.
 *
 * @param baseUrl The llama-swap base URL (e.g. "http://host:8080")
 */
export async function mergeUpstreamMeta(baseUrl: string): Promise<void> {
  if (!cache?.data.length) return;

  const protocol = baseUrl.match(/^https?:/)?.[0] ?? "http:";
  const host = baseUrl.replace(/https?:\/\//, "").replace(/\/.*$/, "");

  for (const model of cache.data) {
    const port = model.meta?.llamaswap?.upstream_port;
    if (!port) continue;

    try {
      const upstreamUrl = `${protocol}//${host}:${port}/v1/models`;
      // Intentionally no auth headers — upstream metadata queries must not
      // forward credentials to arbitrary upstream servers (security).
      const resp = await fetch(upstreamUrl);
      if (!resp.ok) continue;

      const json = await resp.json();
      const upstreamModels = json?.data;
      if (!Array.isArray(upstreamModels)) continue;

      // Merge any upstream meta into our model entry
      for (const um of upstreamModels) {
        if (um.meta) {
          model.meta = {
            ...model.meta,
            upstream: { ...um.meta },
          };
        }
        if (typeof um.max_model_len === "number") {
          model.max_model_len = um.max_model_len;
        }
      }
    } catch {
      // Upstream query failed — degrade gracefully
    }
  }
}


