import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ProviderModelConfig,
} from "@mariozechner/pi-coding-agent";
import { Key, matchesKey } from "@mariozechner/pi-tui";
import { PROVIDER_ID, PROVIDER_NAME } from "./constants";
import { Action } from "./enums/action";
import { RawModel } from "./interfaces/endpoints/models";
import { SwapModel } from "./models/swapModel";
import { resolveApiKey, resolveUrl } from "./tools/resolver";
import {
  getModelOverride,
  readConfig,
  removeModelOverride,
  setModelOverride,
  writeConfig,
  type ModelConfig,
  type ModelOverride,
} from "./config";

/**
 * Builds a flat list of selectable model entries, grouped by base ID.
 * Within each group: parent model first, then its variants.
 */
export function buildModelEntries(
  swapModels: SwapModel[],
  config: ModelConfig,
): SwapModel[] {
  const groups = new Map<string, SwapModel[]>();
  for (const m of swapModels) {
    const group = groups.get(m.baseId) ?? [];
    group.push(m);
    groups.set(m.baseId, group);
  }

  const entries: SwapModel[] = [];
  for (const [, models] of [...groups.entries()].sort(
    (a, b) => a[0].localeCompare(b[0]),
  )) {
    entries.push(...models);
  }

  return entries;
}

/**
 * Builds SelectItem array for the model list, applying config overrides.
 */
export function buildSelectItems(
  entries: SwapModel[],
  config: ModelConfig,
): Array<{ value: string; label: string; description?: string }> {
  return entries.map((entry) => {
    const override = getModelOverride(config, entry.id);
    const inGroup = entries.some(
      (other) => other.baseId === entry.baseId && other.id !== entry.id,
    );

    // Apply overrides to display values
    const displayName = override.displayName ?? entry.name;
    const label = inGroup
      ? `${displayName}${entry.variant ? ` [:${entry.variant}]` : " (base)"}`
      : displayName;
    const effectiveHasImage =
      "hasImage" in override ? override.hasImage! : entry.hasImage;
    const effectiveCtx = override.contextWindow ?? entry.contextWindow;
    const effectiveMax = override.maxTokens ?? entry.maxTokens;
    const caps = effectiveHasImage ? "text, image" : "text";
    const desc = `${caps} • ctx ${effectiveCtx.toLocaleString()} • max ${effectiveMax.toLocaleString()}`;
    return { value: entry.id, label, description: desc };
  });
}

/**
 * Shows the model browser with type-ahead search + arrow nav + pagination.
 * Returns the selected SwapModel or null if cancelled.
 */
async function selectModel(
  ctx: ExtensionCommandContext,
  entries: SwapModel[],
  config: ModelConfig,
): Promise<SwapModel | null> {
  const items = buildSelectItems(entries, config);

  const modelId = await ctx.ui.custom<string | null>((tui, theme, _kb, done) => {
    const visibleHeight = Math.min(items.length, 12);
    let query = "";
    let selected = 0;

    function getFiltered(): typeof items {
      if (!query) return items;
      const q = query.toLowerCase();
      return items.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          (item.description ?? "").toLowerCase().includes(q),
      );
    }

    return {
      render: (w: number): string[] => {
        const filtered = getFiltered();
        const lines: string[] = [];

        // Title
        lines.push(
          theme.fg("accent", theme.bold(` ${PROVIDER_NAME} models `)),
        );

        // Search indicator
        if (query) {
          lines.push(`   Filter: "${query}"`);
        }

        // Model list
        if (filtered.length === 0) {
          lines.push(
            theme.fg("warning", "  No models match your search"),
          );
        } else {
          const start = Math.max(
            0,
            Math.min(
              selected - Math.floor(visibleHeight / 2),
              filtered.length - visibleHeight,
            ),
          );
          const end = Math.min(start + visibleHeight, filtered.length);

          for (let i = start; i < end; i++) {
            const item = filtered[i];
            const prefix = i === selected ? "> " : "  ";
            const style =
              i === selected
                ? theme.fg("accent", prefix + item.label)
                : prefix + item.label;
            const desc = item.description
              ? theme.fg("dim", ` — ${item.description}`)
              : "";
            const fullLine = style + desc;
            lines.push(
              fullLine.length > w - 2
                ? fullLine.slice(0, w - 2)
                : fullLine,
            );
          }

          lines.push(
            theme.fg(
              "dim",
              `  (${selected + 1}/${filtered.length})`,
            ),
          );
        }

        // Help
        lines.push(
          theme.fg(
            "dim",
            " ↑↓ navigate • type to search • enter select • esc cancel",
          ),
        );

        return lines;
      },

      invalidate: () => {},

      handleInput: (data: string) => {
        const filtered = getFiltered();

        if (matchesKey(data, Key.up)) {
          if (selected > 0) selected--;
        } else if (matchesKey(data, Key.down)) {
          if (selected < filtered.length - 1) selected++;
        } else if (matchesKey(data, Key.enter)) {
          if (selected >= 0 && selected < filtered.length) {
            done(filtered[selected].value);
          }
        } else if (matchesKey(data, Key.escape)) {
          done(null);
        } else if (matchesKey(data, Key.backspace)) {
          query = query.slice(0, -1);
          selected = 0;
        } else if (data.length === 1 && !matchesKey(data, Key.space)) {
          query += data;
          selected = 0;
        }
        tui.requestRender();
      },
    };
  });

  if (!modelId) return null;
  return entries.find((e) => e.id === modelId) ?? null;
}

/**
 * Model configuration editor. Allows editing per-model overrides.
 */
interface EditorState {
  displayName: string;
  contextWindow: number;
  maxTokens: number;
  hasImage: boolean;
  reasoning: boolean;
}

function loadEditorState(model: SwapModel, override: ModelOverride): EditorState {
  return {
    displayName: override.displayName ?? model.name,
    contextWindow: override.contextWindow ?? model.contextWindow,
    maxTokens: override.maxTokens ?? model.maxTokens,
    hasImage: "hasImage" in override ? override.hasImage! : model.hasImage,
    reasoning: "reasoning" in override ? override.reasoning! : true,
  };
}

/**
 * Persists the current editor state to config and re-registers the provider.
 * Silent — no notification, called after every change.
 */
async function autoSave(
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  swapModels: SwapModel[],
  model: SwapModel,
  state: EditorState,
): Promise<void> {
  const config = readConfig();
  const updated = setModelOverride(config, model.id, {
    displayName: state.displayName,
    contextWindow: state.contextWindow,
    maxTokens: state.maxTokens,
    hasImage: state.hasImage,
    reasoning: state.reasoning,
  });
  if (!writeConfig(updated)) {
    ctx.ui.notify("Failed to save config", "error");
    return;
  }
  await registerProvider(pi, swapModels);
}

async function editModel(
  ctx: ExtensionCommandContext,
  model: SwapModel,
  config: ModelConfig,
  pi: ExtensionAPI,
  swapModels: SwapModel[],
): Promise<void> {
  const override = getModelOverride(config, model.id);
  let state = loadEditorState(model, override);

  const shortId =
    model.id.length > 50 ? model.id.slice(0, 47) + "…" : model.id;

  while (true) {
    const action = await ctx.ui.select(
      `Configure: ${shortId}`,
      [
        "✏️  Edit display name",
        "📐  Edit context window",
        "📤  Edit max output tokens",
        `🖼️  Toggle image capability (${state.hasImage ? "on" : "off"})`,
        `🧠  Toggle reasoning (${state.reasoning ? "on" : "off"})`,
        "🔄  Reset to defaults",
      ],
    );

    if (action === undefined) return;

    if (action.includes("display name")) {
      const val = await ctx.ui.input("Display name", state.displayName);
      if (val !== undefined && val.trim()) {
        state.displayName = val.trim();
        await autoSave(ctx, pi, swapModels, model, state);
      }
    } else if (action.includes("context window")) {
      const val = await ctx.ui.input(
        "Context window (tokens)",
        String(state.contextWindow),
      );
      const num = Number(val);
      if (val !== undefined && !isNaN(num) && num > 0) {
        state.contextWindow = num;
        await autoSave(ctx, pi, swapModels, model, state);
      }
    } else if (action.includes("max output")) {
      const val = await ctx.ui.input(
        "Max output tokens",
        String(state.maxTokens),
      );
      const num = Number(val);
      if (val !== undefined && !isNaN(num) && num > 0) {
        state.maxTokens = num;
        await autoSave(ctx, pi, swapModels, model, state);
      }
    } else if (action.includes("image")) {
      state.hasImage = !state.hasImage;
      await autoSave(ctx, pi, swapModels, model, state);
    } else if (action.includes("reasoning")) {
      state.reasoning = !state.reasoning;
      await autoSave(ctx, pi, swapModels, model, state);
    } else if (action.includes("Reset")) {
      const cfg = readConfig();
      if (!writeConfig(removeModelOverride(cfg, model.id))) {
        ctx.ui.notify("Failed to save config", "error");
      } else {
        await registerProvider(pi, swapModels);
        ctx.ui.notify(`Reset ${model.id} to defaults`, "info");
      }
      return;
    }
  }
}

/**
 * Re-registers all models with the provider, applying config overrides.
 * Used when the user saves changes in the config editor.
 */
async function registerProvider(
  pi: ExtensionAPI,
  swapModels: SwapModel[],
): Promise<void> {
  const config = readConfig();
  const url = await resolveUrl(process.cwd());
  const apiKey = await resolveApiKey();

  const models: ProviderModelConfig[] = swapModels.map((model) => {
    const override = getModelOverride(config, model.id);
    return model.toProviderConfig(
      override.displayName,
      "reasoning" in override ? override.reasoning! : true,
      override.contextWindow,
      override.maxTokens,
      "hasImage" in override ? override.hasImage : undefined,
    );
  });

  pi.registerProvider(PROVIDER_ID, {
    baseUrl: `${url}/v1`,
    api: "openai-completions",
    apiKey,
    models,
  });
}

/**
 * Resolves the effective display values for a model, applying config overrides.
 */
function resolveEffectiveModel(
  model: SwapModel,
  config: ModelConfig,
): {
  displayName: string;
  contextWindow: number;
  maxTokens: number;
  hasImage: boolean;
  reasoning: boolean;
} {
  const override = getModelOverride(config, model.id);
  return {
    displayName: override.displayName ?? model.name,
    contextWindow: override.contextWindow ?? model.contextWindow,
    maxTokens: override.maxTokens ?? model.maxTokens,
    hasImage: "hasImage" in override ? override.hasImage! : model.hasImage,
    reasoning: "reasoning" in override ? override.reasoning! : true,
  };
}

/**
 * Handles the /models command.
 *
 * Flow: Model browser (type-ahead + arrows + pagination) → action (configure/info/cancel)
 */
export const modelsCommandHandler = async (
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  rawModels: RawModel[],
): Promise<void> => {
  const config = readConfig();
  const swapModels = rawModels.map((m) => new SwapModel(m));
  const entries = buildModelEntries(swapModels, config);

  const model = await selectModel(ctx, entries, config);
  if (!model) return;

  // Resolve effective values (raw model + config overrides)
  const effective = resolveEffectiveModel(model, config);

  // Show action menu
  const action = await ctx.ui.select(
    `${effective.displayName}`,
    [Action.CONFIGURE, Action.INFO, Action.CANCEL],
  );

  if (action === undefined || action === Action.CANCEL) return;

  if (action === Action.INFO) {
    const lines = [
      `ID           : ${model.id}`,
      `Model        : ${effective.displayName}`,
      `Capabilities : ${effective.hasImage ? "text, image" : "text"}`,
      `Context size : ${effective.contextWindow.toLocaleString()}`,
      `Max tokens   : ${effective.maxTokens.toLocaleString()}`,
      `Reasoning    : ${effective.reasoning ? "yes" : "no"}`,
    ];
    ctx.ui.notify(lines.join("\n"), "info");
    return;
  }

  if (action === Action.CONFIGURE) {
    await editModel(ctx, model, config, pi, swapModels);
  }
};
