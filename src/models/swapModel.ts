import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { DEFAULT_CTX, MAX_TOKENS } from "../constants";
import { RawModel } from "../interfaces/endpoints/models";

/**
 * Regex patterns that indicate multimodal (image) capability in model IDs
 */
const IMAGE_CAPABILITY_PATTERN = /mmproj|mm-proj|multimodal|vision|clip/i;

/**
 * Detects if a model supports image input based on its ID
 */
export function detectImageCapability(modelId: string): boolean {
  return IMAGE_CAPABILITY_PATTERN.test(modelId);
}

/**
 * Detects image capability from a llama-server launch command.
 *
 * Checks for mmproj-related flags. Returns:
 * - true  if an enable flag is found (--mmproj, --mmproj-auto, -mm, -mmu, --mmproj-url)
 * - false if a disable flag is found (--no-mmproj, --no-mmproj-auto)
 * - null  if no mmproj flags present (caller should fall back to ID detection)
 *
 * Disable flags take precedence over enable flags.
 */
export function detectImageCapabilityFromCmd(cmd: string): boolean | null {
  // Disable flags (checked first — take precedence)
  if (/--no-mmproj(?!-auto)/.test(cmd)) return false;
  if (/(^|\s)--no-mmproj-auto(?:\s|$)/.test(cmd)) return false;

  // Enable flags
  // --mmproj FILE  (but not --no-mmproj or --mmproj-auto)
  if (/(^|\s)--mmproj(?!-auto)(?:\s|$)/.test(cmd)) return true;
  // --mmproj-auto (but not --no-mmproj-auto)
  if (/(^|\s)--mmproj-auto(?:\s|$)/.test(cmd)) return true;
  // -mm FILE (short flag, must be standalone)
  if (/(^|\s)-mm(?:\s|$)/.test(cmd)) return true;
  // -mmu URL (short flag for --mmproj-url)
  if (/(^|\s)-mmu(?:\s|$)/.test(cmd)) return true;
  // --mmproj-url URL
  if (/(^|\s)--mmproj-url(?:\s|$)/.test(cmd)) return true;

  return null;
}

/**
 * Extracts the base ID (before any colon suffix) from a model ID
 */
export function extractBaseId(modelId: string): string {
  return modelId.includes(":") ? modelId.split(":")[0] : modelId;
}

/**
 * Extracts the variant suffix (everything after the first colon) from a model ID
 */
export function extractVariant(modelId: string): string | undefined {
  const idx = modelId.indexOf(":");
  return idx !== -1 ? modelId.slice(idx + 1) : undefined;
}

/**
 * A SwapModel wraps a RawModel and provides computed properties,
 * labels, and Pi provider config generation.
 */
export class SwapModel {
  constructor(protected readonly raw: RawModel) {}

  get id(): string {
    return this.raw.id;
  }

  get name(): string {
    return this.raw.name ?? this.raw.id;
  }

  get baseId(): string {
    return extractBaseId(this.id);
  }

  get variant(): string | undefined {
    return extractVariant(this.id);
  }

  get hasVariants(): boolean {
    return this.id.includes(":");
  }

  /**
   * Detects if the model can process images.
   *
   * Priority: launch command (--mmproj / --no-mmproj) → model ID patterns → false.
   * Command-based detection only available when model is running (cmd comes from /running).
   */
  get hasImage(): boolean {
    // Check launch command first — authoritative when model is running
    const cmd = this.raw.meta?.llamaswap?.runningCmd;
    if (cmd) {
      const fromCmd = detectImageCapabilityFromCmd(cmd);
      if (fromCmd !== null) return fromCmd;
    }
    // Fall back to model ID pattern detection
    return detectImageCapability(this.id);
  }

  /**
   * Whether this model is currently loaded (running) in llama-swap.
   * Populated by mergeRunningState() from /running endpoint.
   */
  get isRunning(): boolean {
    return !!this.raw.meta?.llamaswap?.isRunning;
  }

  /**
   * Lifecycle state from /running: "ready", "loading", "error", etc.
   * Undefined if model is not running.
   */
  get runningState(): string | undefined {
    return this.raw.meta?.llamaswap?.runningState;
  }

  /**
   * Full command used to start the upstream process.
   * Undefined if model is not running.
   */
  get runningCmd(): string | undefined {
    return this.raw.meta?.llamaswap?.runningCmd;
  }

  /**
   * Gets the context window for this model.
   *
   * Priority: raw.context_window → meta.llamaswap.context_length → meta.upstream.n_ctx_train → DEFAULT_CTX
   */
  get contextWindow(): number {
    // Direct field on the model entry
    if (typeof this.raw.context_window === "number") {
      return this.raw.context_window;
    }
    // llama-swap meta
    const lsCtx = this.raw.meta?.llamaswap?.context_length;
    if (typeof lsCtx === "number") {
      return lsCtx;
    }
    // Upstream meta (n_ctx_train = max trained context)
    const upCtx = this.raw.meta?.upstream?.n_ctx_train;
    if (typeof upCtx === "number") {
      return upCtx;
    }
    return DEFAULT_CTX;
  }

  /**
   * Gets the max output tokens for this model
   */
  get maxTokens(): number {
    return this.raw.max_tokens ?? MAX_TOKENS;
  }

  /**
   * Converts this model into a Pi ProviderModelConfig.
   * Override params take priority over raw model values.
   */
  toProviderConfig(
    displayName?: string,
    reasoning = true,
    contextWindow?: number,
    maxTokens?: number,
    hasImage?: boolean,
  ): ProviderModelConfig {
    return {
      id: this.id,
      name: displayName ?? this.name,
      reasoning,
      input: (hasImage ?? this.hasImage)
        ? (["text", "image"] as const)
        : (["text"] as const),
      contextWindow: contextWindow ?? this.contextWindow,
      maxTokens: maxTokens ?? this.maxTokens,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    };
  }
}
