/**
 * The response from llama-swap's /health endpoint.
 * Returns plain text "OK". isServerReady() only checks HTTP 2xx.
 */
export type HealthResponse = "OK";
