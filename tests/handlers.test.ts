import { describe, expect, it } from "vitest";
import { Action } from "../src/enums/action";
import { RawModel } from "../src/interfaces/endpoints/models";
import { SwapModel } from "../src/models/swapModel";
import { buildModelEntries, buildSelectItems } from "../src/handlers";

/**
 * Tests the action availability logic for the /models command.
 * In llama-swap, all models always have the same actions:
 * CONFIGURE, INFO, CANCEL (no load/unload since llama-swap manages that).
 */
describe("Action availability", () => {
  const createModel = (id: string, name?: string): SwapModel =>
    new SwapModel({ id, name: name ?? id } as RawModel);

  it("should always include CANCEL action", () => {
    expect(Object.values(Action)).toContain(Action.CANCEL);
  });

  it("should always include CONFIGURE action", () => {
    expect(Object.values(Action)).toContain(Action.CONFIGURE);
  });

  it("should always include INFO action", () => {
    expect(Object.values(Action)).toContain(Action.INFO);
  });

  it("should not include load/unload actions (llama-swap manages lifecycle)", () => {
    const actions = Object.values(Action);
    expect(actions).not.toContain("Load" as Action);
    expect(actions).not.toContain("Unload" as Action);
    expect(actions).not.toContain("Switch" as Action);
  });
});

describe("buildModelEntries", () => {
  const createModel = (id: string, name?: string): SwapModel =>
    new SwapModel({ id, name: name ?? id } as RawModel);

  it("should group models by base ID", () => {
    const models = [
      createModel("Llama-3-8B:precise"),
      createModel("Llama-3-8B"),
      createModel("Llama-3-8B:general"),
      createModel("Mistral-7B"),
    ];

    const entries = buildModelEntries(models, { models: {} });

    // Llama-3-8B group (3 models) comes before Mistral-7B (1 model) alphabetically
    expect(entries.length).toBe(4);
    expect(entries[0].baseId).toBe("Llama-3-8B");
    expect(entries[1].baseId).toBe("Llama-3-8B");
    expect(entries[2].baseId).toBe("Llama-3-8B");
    expect(entries[3].baseId).toBe("Mistral-7B");
  });

  it("should sort groups alphabetically by base ID", () => {
    const models = [
      createModel("Zephyr-7B"),
      createModel("Alpha-13B"),
      createModel("Mistral-7B"),
    ];

    const entries = buildModelEntries(models, { models: {} });

    expect(entries[0].baseId).toBe("Alpha-13B");
    expect(entries[1].baseId).toBe("Mistral-7B");
    expect(entries[2].baseId).toBe("Zephyr-7B");
  });

  it("should preserve original order within a group", () => {
    const models = [
      createModel("Llama-3-8B:precise"),
      createModel("Llama-3-8B"),
      createModel("Llama-3-8B:general"),
    ];

    const entries = buildModelEntries(models, { models: {} });

    expect(entries[0].id).toBe("Llama-3-8B:precise");
    expect(entries[1].id).toBe("Llama-3-8B");
    expect(entries[2].id).toBe("Llama-3-8B:general");
  });
});

describe("buildSelectItems", () => {
  const createModel = (id: string, name?: string): SwapModel =>
    new SwapModel({ id, name: name ?? id } as RawModel);

  it("should produce items with correct labels for grouped models", () => {
    const models = [
      createModel("Llama-3-8B"),
      createModel("Llama-3-8B:precise"),
    ];

    const items = buildSelectItems(models, { models: {} });

    expect(items.length).toBe(2);
    // Base model gets "(base)" suffix
    expect(items[0].label).toBe("Llama-3-8B (base)");
    // Variant uses full name with [variant] suffix
    expect(items[1].label).toBe("Llama-3-8B:precise [:precise]");
  });

  it("should produce items without grouping suffix for standalone models", () => {
    const models = [createModel("Mistral-7B")];

    const items = buildSelectItems(models, { models: {} });

    expect(items[0].label).toBe("Mistral-7B");
  });

  it("should include searchable description with capabilities and context", () => {
    const models = [createModel("Qwen3-32B-mmproj")];

    const items = buildSelectItems(models, { models: {} });

    expect(items[0].description).toContain("text, image");
    expect(items[0].description).toContain("ctx");
    expect(items[0].description).toContain("max");
  });

  it("should apply display name override from config", () => {
    const models = [createModel("Llama-3-8B")];
    const config = {
      models: {
        "Llama-3-8B": { displayName: "My Custom Llama" },
      },
    };

    const items = buildSelectItems(models, config);

    expect(items[0].label).toBe("My Custom Llama");
  });

  it("should apply context window override from config", () => {
    const models = [createModel("Llama-3-8B")];
    const config = {
      models: {
        "Llama-3-8B": { contextWindow: 65536 },
      },
    };

    const items = buildSelectItems(models, config);

    expect(items[0].description).toContain("65,536");
  });

  it("should apply max tokens override from config", () => {
    const models = [createModel("Llama-3-8B")];
    const config = {
      models: {
        "Llama-3-8B": { maxTokens: 4096 },
      },
    };

    const items = buildSelectItems(models, config);

    expect(items[0].description).toContain("4,096");
  });

  it("should apply hasImage override from config", () => {
    const models = [createModel("Llama-3-8B")];
    const config = {
      models: {
        "Llama-3-8B": { hasImage: true },
      },
    };

    const items = buildSelectItems(models, config);

    expect(items[0].description).toContain("text, image");
  });

  it("should produce items filterable by label (case-insensitive match)", () => {
    const models = [
      createModel("Llama-3-8B"),
      createModel("Mistral-7B"),
    ];

    const items = buildSelectItems(models, { models: {} });

    const filtered = items.filter(
      (item) =>
        item.label.toLowerCase().includes("llama") ||
        (item.description ?? "").toLowerCase().includes("llama"),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe("Llama-3-8B");
  });

  it("should produce items filterable by description content", () => {
    const models = [
      createModel("Qwen3-32B-mmproj"),
      createModel("Llama-3-8B"),
    ];

    const items = buildSelectItems(models, { models: {} });

    const filtered = items.filter(
      (item) =>
        item.label.toLowerCase().includes("mmproj") ||
        (item.description ?? "").toLowerCase().includes("mmproj"),
    );
    expect(filtered.length).toBe(1);
    expect(filtered[0].value).toBe("Qwen3-32B-mmproj");
  });

  it("should return empty filtered set when no label/description matches", () => {
    const models = [createModel("Llama-3-8B")];

    const items = buildSelectItems(models, { models: {} });

    const filtered = items.filter(
      (item) =>
        item.label.toLowerCase().includes("nonexistent") ||
        (item.description ?? "").toLowerCase().includes("nonexistent"),
    );
    expect(filtered.length).toBe(0);
  });

  it("should include running indicator in description", () => {
    const models = [createModel("Llama-3-8B")];

    const items = buildSelectItems(models, { models: {} });

    expect(items[0].description).toContain("not loaded");
    expect(items[0].isRunning).toBe(false);
  });

  it("should show ready indicator for running models", () => {
    const model = new SwapModel({
      id: "Llama-3-8B",
      name: "Llama 3 8B",
      meta: { llamaswap: { isRunning: true, runningState: "ready" } },
    } as RawModel);

    const items = buildSelectItems([model], { models: {} });

    expect(items[0].description).toContain("ready");
    expect(items[0].isRunning).toBe(true);
  });

  it("should show loading indicator for loading models", () => {
    const model = new SwapModel({
      id: "Llama-3-8B",
      meta: { llamaswap: { isRunning: true, runningState: "loading" } },
    } as RawModel);

    const items = buildSelectItems([model], { models: {} });

    expect(items[0].description).toContain("loading");
    expect(items[0].isRunning).toBe(true);
  });

  it("should show error indicator for error state", () => {
    const model = new SwapModel({
      id: "Llama-3-8B",
      meta: { llamaswap: { isRunning: true, runningState: "error" } },
    } as RawModel);

    const items = buildSelectItems([model], { models: {} });

    expect(items[0].description).toContain("error");
    expect(items[0].isRunning).toBe(true);
  });
});

describe("Config override application", () => {
  it("should apply display name override", () => {
    const model = new SwapModel({
      id: "test-model",
      name: "Original Name",
    } as RawModel);

    const config = model.toProviderConfig("Custom Name", true);
    expect(config.name).toBe("Custom Name");
  });

  it("should apply reasoning override", () => {
    const model = new SwapModel({
      id: "test-model",
    } as RawModel);

    const config = model.toProviderConfig(undefined, false);
    expect(config.reasoning).toBe(false);
  });

  it("should default reasoning to true", () => {
    const model = new SwapModel({
      id: "test-model",
    } as RawModel);

    const config = model.toProviderConfig();
    expect(config.reasoning).toBe(true);
  });
});
