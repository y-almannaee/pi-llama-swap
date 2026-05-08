/**
 * The structure of llama-swap's /v1/models endpoint (OpenAI-compatible)
 */
export interface ModelsEndpoint {
  object: "list";
  data: RawModel[];
}

/**
 * llama-swap metadata embedded in model entries.
 * Exposed by llama-swap for discovery purposes.
 */
export interface LlamaSwapMeta {
  /** Configured context length for this model */
  context_length?: number;
  /** Current n_ctx setting */
  n_ctx?: number;
  /** Peer ID (for distributed setups) */
  peerID?: string;
  /** Whether this model is currently loaded (merged from /running) */
  isRunning?: boolean;
  /** Lifecycle state from /running: "ready", "loading", "error" */
  runningState?: string;
  /** Time-to-live in seconds before auto-unload */
  runningTtl?: number;
  /** Full command used to start the upstream process (from /running) */
  runningCmd?: string;
}

/**
 * A single entry from GET /running.
 *
 * Live shape (confirmed against llama-swap):
 * {
 *   "cmd": "llama-server.exe --port 5801 -m ...",
 *   "description": "",
 *   "model": "Qwen3.6-27B-Q4_K_M-ik-mtp",
 *   "name": "",
 *   "proxy": "http://localhost:5801",
 *   "state": "ready",
 *   "ttl": 10800
 * }
 */
export interface RunningEntry {
  /** Model identifier — matches a base id from /v1/models */
  model?: string;
  /** Lifecycle state: "ready", "loading", "error", etc. */
  state?: string;
  /** Internal upstream proxy URL (e.g. "http://localhost:5801") */
  proxy?: string;
  /** Full command used to start the upstream process */
  cmd?: string;
  /** Human-readable description (often empty) */
  description?: string;
  /** Display name (often empty) */
  name?: string;
  /** Time-to-live in seconds before auto-unload */
  ttl?: number;
}

/**
 * Response shape for GET /running.
 */
export interface RunningEndpoint {
  running: RunningEntry[];
}

/**
 * Upstream backend metadata — defensive shape for arbitrary backends.
 *
 * ik_llama.cpp exposes: vocab_type, n_vocab, n_ctx_train, n_embd,
 * n_params, size. vLLM and other backends may expose different fields.
 *
 * We capture all numeric fields defensively via the index signature.
 */
export interface UpstreamMeta {
  vocab_type?: number;
  n_vocab?: number;
  n_ctx_train?: number;
  n_embd?: number;
  n_params?: number;
  size?: number;
  /** Arbitrary backend-specific numeric fields */
  [key: string]: unknown;
}

/**
 * A raw model entry from the /v1/models response.
 *
 * llama-swap may attach a `meta` block with backend-specific info.
 * Upstream backends (ik_llama.cpp, vLLM, etc.) may expose additional
 * metadata at their own /v1/models endpoint.
 *
 * Fields are defensive — tolerate missing, extra, or unexpected data.
 */
export interface RawModel {
  id: string;
  name?: string;
  context_window?: number;
  max_tokens?: number;
  object?: string;
  owned_by?: string;
  /** llama-swap metadata (context_length, upstream_port, etc.) */
  meta?: {
    llamaswap?: LlamaSwapMeta;
    /** Merged upstream metadata */
    upstream?: UpstreamMeta;
    [key: string]: unknown;
  };
  /** Upstream's actual configured context length (ik_llama.cpp) */
  max_model_len?: number;
  [key: string]: unknown;
}


