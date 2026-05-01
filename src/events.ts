import { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { PROVIDER_NAME } from "./constants";
import { ModelSelectEvent } from "./interfaces/events";
import { listModels } from "./tools/retriever";

/**
 * Reacts to a new model event triggered by Pi
 * @param event Model selection event
 * @param ctx Pi context
 */
export const onModelSelect = async (
  event: ModelSelectEvent,
  ctx: ExtensionContext,
) => {
  if (event.model.provider !== PROVIDER_NAME) return;

  const models = await listModels();
  const model = models.find((m) => m.id === event.model.id);
  if (!model) return;

  ctx.ui.notify(`>> Loading ${model.id}...`, "info");
  await model.load();
};
