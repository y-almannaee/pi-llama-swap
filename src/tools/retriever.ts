import { API_KEY_PLACEHOLDER } from "../constants";
import { HealthEndpoint } from "../interfaces/endpoints/health";
import { ModelsEndpoint, RawModel } from "../interfaces/endpoints/models";
import { resolveApiKey, resolveUrl } from "./resolver";

// ---------------------------------------------------------------------------
// Runtime validators
// ---------------------------------------------------------------------------

/** A simple key/value check for response validation (no zod). */
export type Validator = {
  [key: string]: unknown;
};

/**
 * Checks that `data` contains every key/value pair in `schema`.
 * Throws a descriptive Error on mismatch.
 */
export const validateResponse = (data: unknown, schema: Validator): void => {
  if (data == null || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Response body is not an object");
  }
  const entries = Object.entries(schema);
  for (const [key, expected] of entries) {
    if (!(key in data)) {
      throw new Error(`Response is missing expected key "${key}"`);
    }
    if ((data as Record<string, unknown>)[key] !== expected) {
      throw new Error(
        `Response key "${key}" has value ${JSON.stringify(
          (data as Record<string, unknown>)[key],
        )}, expected ${JSON.stringify(expected)}`,
      );
    }
  }
};

/** Pre-built validators for known endpoint shapes. */
export const validators = {
  ModelsEndpoint: { object: "list" } satisfies Validator,
  HealthEndpoint: { status: "ok" } satisfies Validator,
} as const;

/**
 * Detects if the server is ready
 */
export const isServerReady = async (): Promise<boolean> => {
  try {
    const res = await fetch(`${await resolveUrl(process.cwd())}/health`, {
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Generic RPC helper for llama-swap endpoints.
 *
 * @param validator - Optional shape descriptor checked against the parsed
 *   response body. Use `validators.ModelsEndpoint`, etc., or pass a plain
 *   object like `{ object: "list" }`.
 */
export const rpc = async <T>(
  endpoint: string,
  body?: Record<string, unknown>,
  validator?: Validator,
): Promise<T> => {
  const base = await resolveUrl(process.cwd());
  const url = `${base}${endpoint}`;
  const apiKey = await resolveApiKey();

  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(apiKey && apiKey !== API_KEY_PLACEHOLDER
        ? { Authorization: `Bearer ${apiKey}` }
        : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }

  const data = await res.json();
  if (validator) validateResponse(data, validator);
  return data as T;
};

/**
 * Retrieves a list of available models from llama-swap
 */
export const listModels = async (): Promise<RawModel[]> => {
  const payload = await rpc<ModelsEndpoint>(
    "/v1/models",
    undefined,
    validators.ModelsEndpoint,
  );
  return payload.data;
};
