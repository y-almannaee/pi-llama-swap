import { ExtensionContext } from "@mariozechner/pi-coding-agent";
import { PROVIDER_ID } from "./constants";
import { ModelSelectEvent } from "./interfaces/events";
import { refreshUrl } from "./tools/resolver";

/**
 * Reacts to a model selection event triggered by Pi.
 * Notifies the user when a llama-swap model is selected via the model picker.
 */
export const onModelSelect = (
  event: ModelSelectEvent,
  ctx: ExtensionContext,
): void => {
  if (event.model.provider !== PROVIDER_ID) return;
  ctx.ui.notify(`>> Using ${event.model.id}`, "info");

  // Non-blocking URL cache refresh — keeps URL fresh without blocking UI
  void refreshUrl(process.cwd());
};
