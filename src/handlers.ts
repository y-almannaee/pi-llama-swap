import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { Status } from "./enums/status";
import { BaseModel } from "./models/baseModel";
import { Actions } from "./enums/actions";
import { PROVIDER_NAME } from "./constants";

/**
 * Defines a handler when llama-server is running
 * @param ctx Pi context
 * @returns The action and model, if detected
 */
const modelSelectionHandler = async (
  ctx: ExtensionCommandContext,
  models: BaseModel[],
): Promise<{ action: Actions; model: BaseModel } | null> => {
  // Setup the labels
  const labels = await Promise.all(models.map((m) => m.getLabel()));

  // Detect the selected model
  const choice = await ctx.ui.select(`${PROVIDER_NAME} models:`, labels);
  if (!choice) return null;

  const idx = labels.indexOf(choice);
  const model = models[idx];

  // Define the actions that the user can do
  const allActions = {
    [Status.LOADED]: [Actions.UNLOAD, Actions.CANCEL],
    [Status.LOADING]: [Actions.CANCEL],
    [Status.FAILED]: [Actions.SWITCH, Actions.CANCEL],
    [Status.UNLOADED]: [Actions.SWITCH, Actions.CANCEL],
  };

  const status = await model.getStatus();
  const actions = allActions[status];

  const action = (await ctx.ui.select(`${model.id}`, actions)) as Actions;
  if (!action || action === Actions.CANCEL) return null;

  // Send the selected action with the corresponding model
  return { action, model };
};

/**
 * Handles the /models command
 * @param ctx The context used by Pi
 * @param pi The Pi extension
 */
export const modelsCommandHandler = async (
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  models: BaseModel[],
): Promise<void> => {
  const event = await modelSelectionHandler(ctx, models);
  if (!event) return;

  // Detect the model
  const { action, model } = event;

  // Execute the selected action
  if (action === Actions.UNLOAD) {
    await model.unload();
    ctx.ui.notify(`Unloaded ${model.id}`, "info");
  } else {
    const status = await model.getStatus();
    if (status === Status.LOADED) return;

    ctx.ui.notify(`Loading ${model.id}...`, "info");

    // Load the model without blocking the UI
    const onSuccess = async () => {
      const piModel = ctx.modelRegistry.find(PROVIDER_NAME, model.id);
      if (!piModel) {
        throw new Error(`Cannot find model ${model.id} in pi registry`);
      }

      await pi.setModel(piModel);
      ctx.ui.notify(`Model ${model.id} ready`, "info");
    };

    const onFailure = (err: any) => {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(message, "error");
    };

    model.load().then(onSuccess).catch(onFailure);
  }
};
