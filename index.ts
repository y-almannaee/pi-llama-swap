import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { modelsCommandHandler } from "./src/handlers";
import { isServerReady, listModels } from "./src/tools/retriever";
import { resolveApiKey, resolveUrl } from "./src/tools/resolver";
import { PROVIDER_NAME } from "./src/constants";
import { onModelSelect } from "./src/events";

export default async function (pi: ExtensionAPI) {
  // Command registration
  if (!(await isServerReady())) {
    pi.registerCommand("models", {
      description: `${PROVIDER_NAME} models (offline)`,
      handler: async (
        _: string,
        ctx: ExtensionCommandContext,
      ): Promise<void> => {
        const url = await resolveUrl(ctx.cwd);
        ctx.ui.notify(`${PROVIDER_NAME} unreachable at ${url}`, "error");
      },
    });

    return;
  }

  const cwd = process.cwd();
  const url = await resolveUrl(cwd);
  const serverModels = await listModels();

  pi.registerCommand("models", {
    description: `Browse ${PROVIDER_NAME} models (live status)`,
    handler: async (_: string, ctx: ExtensionCommandContext) =>
      await modelsCommandHandler(ctx, pi, serverModels),
  });

  // Provider registration
  pi.registerProvider(PROVIDER_NAME, {
    baseUrl: `${url}/v1`,
    api: "openai-completions",
    apiKey: await resolveApiKey(),
    models: await Promise.all(serverModels.map((m) => m.toProviderConfig())),
  });

  // Events registration
  pi.on("model_select", onModelSelect);
}
