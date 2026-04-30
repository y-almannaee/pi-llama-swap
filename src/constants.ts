/**
 * This provider's id
 */
export const PROVIDER_ID = "llama-server";

/**
 * This provider's name
 */
export const PROVIDER_NAME = "Llama.cpp";

/**
 * The default URL if the resolver couldn't find it
 */
export const DEFAULT_LLAMA_SERVER_URL = "http://127.0.0.1:8080";

/**
 * The default context if the server didn't expose it
 */
export const DEFAULT_CTX = 128000;

/**
 * Maximum number of tokens a model can generate in a single response
 */
export const MAX_TOKENS = 16384;

/**
 * Polling interval (ms) for checking model load status
 */
export const POLLING_INTERVAL = 500;

/**
 * Maximum time (ms) to wait for model loading before giving up
 */
export const POLLING_TIMEOUT = 60000;
