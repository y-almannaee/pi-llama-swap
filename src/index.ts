import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ProviderModelConfig,
} from "@mariozechner/pi-coding-agent";
import { PROVIDER_ID, PROVIDER_NAME } from "./constants";
import { onModelSelect } from "./events";
import { modelsCommandHandler } from "./handlers";
import { SwapModel } from "./models/swapModel";
import { getModelOverride, readConfig } from "./config";
import { resolveApiKey, resolveUrl } from "./tools/resolver";
import { RawModel } from "./interfaces/endpoints/models";
import { isServerReady } from "./tools/retriever";
import {
  fetchFresh,
  fetchRunningState,
  getModels,
  mergeRunningState,
  mergeUpstreamMeta,
  resetCache,
} from "./tools/cache";

/**
 * Resets the model cache. Exposed for testing.
 */
export { resetCache };

/**
 * Builds provider model configs from raw models, applying config overrides.
 */
async function buildProviderModels(
  rawModels: RawModel[],
): Promise<ProviderModelConfig[]> {
  const config = readConfig();
  const swapModels = rawModels.map((m) => new SwapModel(m));

  return swapModels.map((model) => {
    const override = getModelOverride(config, model.id);
    return model.toProviderConfig(
      override.displayName,
      "reasoning" in override ? override.reasoning! : true,
      override.contextWindow,
      override.maxTokens,
      "hasImage" in override ? override.hasImage : undefined,
    );
  });
}

export default async function (pi: ExtensionAPI) {
  // Check server availability
  if (!(await isServerReady())) {
    pi.registerCommand("swap:models", {
      description: `${PROVIDER_NAME} models (offline)`,
      handler: async (
        _: string,
        ctx: ExtensionCommandContext,
      ): Promise<void> => {
        ctx.ui.notify(`${PROVIDER_NAME} is unreachable`, "error");
      },
    });
    return;
  }

  // Resolve URL and API key
  const url = await resolveUrl(process.cwd());
  const apiKey = await resolveApiKey();

  // Fetch models (populates cache for stale-while-revalidate)
  const rawModels = await fetchFresh();

  // Fetch running state and merge into model entries
  // Fire-and-forget — does not block startup
  const runningEntries = await fetchRunningState();
  mergeRunningState(rawModels, runningEntries);

  if (rawModels.length === 0) {
    pi.registerCommand("swap:models", {
      description: `${PROVIDER_NAME} models (no models)`,
      handler: async (
        _: string,
        ctx: ExtensionCommandContext,
      ): Promise<void> => {
        ctx.ui.notify(
          `${PROVIDER_NAME}: no models found at ${url}`,
          "warning",
        );
      },
    });
    return;
  }

  // Register provider with all models
  pi.registerProvider(PROVIDER_ID, {
    baseUrl: `${url}/v1`,
    api: "openai-completions",
    apiKey,
    models: await buildProviderModels(rawModels),
  });

  // Register /models command — uses cached models (stale-while-revalidate)
  // so it returns instantly and refreshes in the background
  pi.registerCommand("swap:models", {
    description: `Browse ${PROVIDER_NAME} models`,
    handler: async (_: string, ctx: ExtensionCommandContext) => {
      const models = await getModels();
      if (models.length === 0) {
        ctx.ui.notify(`No models loaded in ${PROVIDER_NAME}`, "info");
        return;
      }
      // Refresh running state for live indicators
      const runningEntries = await fetchRunningState();
      mergeRunningState(models, runningEntries);
      await modelsCommandHandler(ctx, pi, models);
    },
  });

  // Listen for model selection events
  pi.on("model_select", onModelSelect);
}
