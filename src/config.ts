import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Path to the per-model overrides file */
const CONFIG_PATH = join(
  homedir(),
  ".pi",
  "agent",
  "extensions",
  "pi-llama-swap",
  "config.json",
);

/** Per-model override stored in config.json */
export interface ModelOverride {
  /** Friendly display name */
  displayName?: string;
  /** Context window in tokens */
  contextWindow?: number;
  /** Max output tokens */
  maxTokens?: number;
  /** Whether the model supports image input */
  hasImage?: boolean;
  /** Whether the model supports extended thinking */
  reasoning?: boolean;
}

/** Full config file shape */
export interface ModelConfig {
  models: Record<string, ModelOverride>;
}

/**
 * Reads the config file. Returns empty config if file doesn't exist.
 */
export function readConfig(): ModelConfig {
  try {
    const raw = readFileSync(CONFIG_PATH, "utf-8");
    const parsed = JSON.parse(raw) as ModelConfig;
    if (parsed && typeof parsed === "object" && "models" in parsed && typeof parsed.models === "object" && parsed.models !== null && !Array.isArray(parsed.models)) {
      return parsed;
    }
  } catch {
    // File missing or unparseable — return empty config
  }
  return { models: {} };
}

/**
 * Writes the config file. Returns true on success, false on failure.
 */
export function writeConfig(config: ModelConfig): boolean {
  try {
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Gets the override for a model, merged with defaults.
 */
export function getModelOverride(
  config: ModelConfig,
  modelId: string,
): ModelOverride {
  return config.models[modelId] ?? {};
}

/**
 * Updates the override for a model.
 */
export function setModelOverride(
  config: ModelConfig,
  modelId: string,
  override: ModelOverride,
): ModelConfig {
  return {
    models: {
      ...config.models,
      [modelId]: override,
    },
  };
}

/**
 * Removes the override for a model, letting the cache handle its fields.
 */
export function removeModelOverride(
  config: ModelConfig,
  modelId: string,
): ModelConfig {
  const models = { ...config.models };
  delete models[modelId];
  return { models };
}
