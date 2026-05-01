import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import { PROVIDER_ID, PROVIDER_NAME } from "./constants";
import { Action } from "./enums/action";
import { Mode } from "./enums/mode";
import { Status } from "./enums/status";
import { BaseModel } from "./models/baseModel";

/**
 * Select a model from the list. Returns null if user cancels.
 *
 * @param ctx Pi context
 * @param models A list of models
 * @returns The selected model
 */
const selectModel = async (
  ctx: ExtensionCommandContext,
  models: BaseModel[],
): Promise<BaseModel | null> => {
  const labels = await Promise.all(models.map((m) => m.getLabel()));
  const choice = await ctx.ui.select(`${PROVIDER_NAME} models:`, labels);
  if (!choice) return null;
  const idx = labels.indexOf(choice);
  return models[idx];
};

/**
 * Get available actions for a model based on its mode and status.
 *
 * @param model The selected model
 * @returns
 */
const getActionsForModel = async (model: BaseModel): Promise<Array<Action>> => {
  const routerModeActions: Record<Status, Array<Action>> = {
    [Status.LOADED]: [Action.SWITCH, Action.UNLOAD, Action.INFO, Action.CANCEL],
    [Status.LOADING]: [Action.CANCEL],
    [Status.FAILED]: [Action.RETRY, Action.CANCEL],
    [Status.SLEEPING]: [Action.UNLOAD, Action.INFO, Action.CANCEL],
    [Status.UNLOADED]: [Action.LOAD, Action.CANCEL],
  };

  const singleModeActions: Record<Status, Array<Action>> = {
    [Status.LOADED]: [Action.INFO, Action.CANCEL],
    [Status.LOADING]: [Action.CANCEL],
    [Status.FAILED]: [Action.CANCEL],
    [Status.SLEEPING]: [Action.INFO, Action.CANCEL],
    [Status.UNLOADED]: [Action.CANCEL],
  };

  const allActions =
    model.mode === Mode.ROUTER ? routerModeActions : singleModeActions;

  const status = await model.getStatus();
  return allActions[status];
};

/**
 * Selects an action for a model.
 *
 * @param ctx Pi context
 * @param model The selected model
 * @param actions Possible actions to execute
 * @returns The action, or null if user cancels
 */
const selectAction = async (
  ctx: ExtensionCommandContext,
  model: BaseModel,
  actions: Array<Action>,
): Promise<Action | null> => {
  const labels = actions.map((a) => String(a));
  const choice = await ctx.ui.select(`${model.name}`, labels);
  if (!choice) return null;

  const idx = labels.indexOf(choice);
  return actions[idx];
};

/**
 * Handles the menu for model selection
 * Loops: select model → select action → handle action.
 *
 * Escape on actions menu goes back to model selection.
 * Escape on model selection exits.
 *
 * @param ctx Pi context
 * @returns The action and model, if detected
 */
const modelSelectionHandler = async (
  ctx: ExtensionCommandContext,
  models: BaseModel[],
): Promise<{ action: Action; model: BaseModel } | null> => {
  while (true) {
    // Select the model
    const model = await selectModel(ctx, models);
    if (!model) return null;

    // Select the action
    const actions = await getActionsForModel(model);
    const action = await selectAction(ctx, model, actions);
    if (action === null) {
      // Escape key pressed => back to model selection
      continue;
    }

    // Return the selected action and model
    return { action, model };
  }
};

/**
 * Handles the /models command
 *
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

  // Action: Cancel
  if (!action || action === Action.CANCEL) return;

  // Action: Info
  if (action === Action.INFO) {
    const info = await model.getInfo();
    ctx.ui.notify(`${info}`, "info");
    return;
  }

  // Action: Unload
  if (action === Action.UNLOAD) {
    await model.unload();
    ctx.ui.notify(`Unloaded ${model.name}`, "info");
    return;
  }

  // Actions: Load/Switch/Retry
  const loadActions = [Action.LOAD, Action.SWITCH, Action.RETRY];
  if (loadActions.includes(action)) {
    ctx.ui.notify(`Loading ${model.name}...`, "info");

    const onSuccess = async () => {
      const piModel = ctx.modelRegistry.find(PROVIDER_ID, model.id);
      if (!piModel) {
        throw new Error(`Cannot find model ${model.name} in pi registry`);
      }

      if ((await model.getStatus()) === Status.FAILED) {
        throw new Error("Failed to load model");
      }

      await pi.setModel(piModel);
      ctx.ui.notify(`Model ${model.name} ready`, "info");
    };

    const onFailure = (err: any) => {
      const message = err instanceof Error ? err.message : String(err);
      ctx.ui.notify(message, "error");
    };

    // Load the model without blocking the UI
    model.load().then(onSuccess).catch(onFailure);
  }
};
