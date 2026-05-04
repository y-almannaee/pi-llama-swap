import { access, constants, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  API_KEY_PLACEHOLDER,
  DEFAULT_LLAMA_SWAP_URL,
  PROVIDER_ID,
} from "../constants";
import { AuthFile } from "../interfaces/auth";

// The URL is detected once, to reuse forever
let resolvedUrl: string | undefined;

/**
 * Detects if a particular file is present
 */
const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/**
 * Reads the contents of a file as JSON
 */
const readContents = async <T>(filePath: string): Promise<T | null> => {
  const raw = await readFile(filePath, "utf-8");
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

/**
 * Reads a value from a JSON config file
 */
const readConfigValue = async <T>(
  filePath: string,
  key: keyof T,
): Promise<T[keyof T] | null> => {
  const cfg = await readContents<T>(filePath);
  return cfg?.[key] ?? null;
};

/**
 * Reads API key from Pi's auth file
 */
export const resolveApiKey = async (): Promise<string> => {
  const authPath = join(process.env.HOME || ".", ".pi", "agent", "auth.json");
  if (!(await fileExists(authPath))) return API_KEY_PLACEHOLDER;

  const cfg = await readConfigValue<AuthFile>(authPath, PROVIDER_ID);
  return cfg?.key ?? API_KEY_PLACEHOLDER;
};

/**
 * Resolves the llama-swap URL from global settings
 */
const resolveGlobalUrl = async (): Promise<string | null> => {
  const globalPath = join(
    process.env.HOME || ".",
    ".pi",
    "agent",
    "settings.json",
  );
  if (!(await fileExists(globalPath))) return null;
  return readConfigValue<Record<string, string>>(globalPath, "llamaSwapUrl");
};

/**
 * Resolves the llama-swap URL from project-level config
 */
const resolveProjectUrl = async (cwd: string): Promise<string | null> => {
  const projectPath = join(cwd, ".pi", "llama-swap.json");
  if (!(await fileExists(projectPath))) return null;
  return readConfigValue<Record<string, string>>(projectPath, "url");
};

/**
 * Resolves the llama-swap URL from environment variable
 */
const resolveEnvUrl = (): string | null => {
  return process.env.LLAMA_SWAP_URL ?? null;
};

/**
 * Tries all possible ways to retrieve the llama-swap URL
 *
 * Priority:
 * 1. Per-project config (.pi/llama-swap.json)
 * 2. Environment variable (LLAMA_SWAP_URL)
 * 3. Global settings (~/.pi/agent/settings.json → llamaSwapUrl)
 * 4. Default (http://127.0.0.1:8080)
 */
const resolveUrlWithFallbacks = async (cwd: string): Promise<string> => {
  let response = await resolveProjectUrl(cwd);
  if (response) return response;

  response = resolveEnvUrl();
  if (response) return response;

  response = await resolveGlobalUrl();
  if (response) return response;

  return DEFAULT_LLAMA_SWAP_URL;
};

/**
 * Resolves the URL where llama-swap is running
 */
export const resolveUrl = async (cwd: string): Promise<string> => {
  if (resolvedUrl) return resolvedUrl;
  const result = await resolveUrlWithFallbacks(cwd);
  resolvedUrl = result.replace(/\/+$/, "");
  return resolvedUrl;
};

/**
 * Resets the cached URL (useful for testing or reconfiguration)
 */
export const resetUrlCache = (): void => {
  resolvedUrl = undefined;
};

/**
 * Non-blocking URL cache refresh.
 *
 * Invalidates the cached URL and re-resolves it from config sources.
 * Used as a fire-and-forget call to keep the URL fresh during active usage
 * without blocking the UI flow.
 *
 * @param cwd Current working directory for project-level config lookup
 */
export const refreshUrl = async (cwd: string): Promise<void> => {
  resetUrlCache();
  await resolveUrl(cwd);
};
