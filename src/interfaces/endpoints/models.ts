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
  /** Port of the upstream backend serving this model */
  upstream_port?: number;
  /** Peer ID (for distributed setups) */
  peerID?: string;
}

/**
 * Upstream backend metadata (e.g., ik_llama.cpp model_meta()).
 * Optional — not all upstreams expose this.
 */
export interface UpstreamMeta {
  vocab_type?: number;
  n_vocab?: number;
  n_ctx_train?: number;
  n_embd?: number;
  n_params?: number;
  size?: number;
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


