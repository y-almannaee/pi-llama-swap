import { describe, expect, it } from "vitest";
import { DEFAULT_CTX, MAX_TOKENS } from "../src/constants";
import { RawModel } from "../src/interfaces/endpoints/models";
import {
  SwapModel,
  detectImageCapability,
  extractBaseId,
  extractVariant,
} from "../src/models/swapModel";

const createRawModel = (
  overrides: Partial<RawModel> = {},
): RawModel => ({
  id: "test-model",
  name: "Test Model",
  context_window: 8192,
  max_tokens: 4096,
  ...overrides,
});

describe("extractBaseId", () => {
  it("returns full ID when no colon", () => {
    expect(extractBaseId("Llama-3-8B")).toBe("Llama-3-8B");
  });

  it("returns part before colon", () => {
    expect(extractBaseId("Llama-3-8B:precise")).toBe("Llama-3-8B");
  });

  it("handles multiple colons", () => {
    expect(extractBaseId("model:v1:test")).toBe("model");
  });
});

describe("extractVariant", () => {
  it("returns undefined when no colon", () => {
    expect(extractVariant("Llama-3-8B")).toBeUndefined();
  });

  it("returns part after colon", () => {
    expect(extractVariant("Llama-3-8B:precise")).toBe("precise");
  });
});

describe("detectImageCapability", () => {
  it("detects mmproj in ID", () => {
    expect(detectImageCapability("Qwen3-32B-mmproj")).toBe(true);
  });

  it("detects mm-proj in ID", () => {
    expect(detectImageCapability("model-mm-proj-v2")).toBe(true);
  });

  it("detects multimodal in ID", () => {
    expect(detectImageCapability("multimodal-model")).toBe(true);
  });

  it("detects vision in ID", () => {
    expect(detectImageCapability("LLaVA-vision")).toBe(true);
  });

  it("returns false for text-only IDs", () => {
    expect(detectImageCapability("Llama-3-8B")).toBe(false);
    expect(detectImageCapability("Mistral-7B")).toBe(false);
  });
});

describe("SwapModel", () => {
  it("exposes raw properties", () => {
    const model = new SwapModel(createRawModel({ id: "my-model" }));
    expect(model.id).toBe("my-model");
    expect(model.name).toBe("Test Model");
    expect(model.contextWindow).toBe(8192);
    expect(model.maxTokens).toBe(4096);
  });

  it("falls back to defaults when raw values missing", () => {
    const model = new SwapModel(
      createRawModel({
        id: "bare-model",
        name: undefined,
        context_window: undefined,
        max_tokens: undefined,
      }),
    );
    expect(model.name).toBe("bare-model");
    expect(model.contextWindow).toBe(DEFAULT_CTX);
    expect(model.maxTokens).toBe(MAX_TOKENS);
  });

  it("computes baseId and variant correctly", () => {
    const model = new SwapModel(
      createRawModel({ id: "Llama-3-8B:precise" }),
    );
    expect(model.baseId).toBe("Llama-3-8B");
    expect(model.variant).toBe("precise");
    expect(model.hasVariants).toBe(true);
  });

  it("detects image capability from ID", () => {
    const model = new SwapModel(
      createRawModel({ id: "Qwen3-32B-mmproj" }),
    );
    expect(model.hasImage).toBe(true);

    const textModel = new SwapModel(
      createRawModel({ id: "Llama-3-8B" }),
    );
    expect(textModel.hasImage).toBe(false);
  });

  it("generates provider config", () => {
    const model = new SwapModel(
      createRawModel({ id: "text-model" }),
    );
    const config = model.toProviderConfig("Custom Name", false);

    expect(config.id).toBe("text-model");
    expect(config.name).toBe("Custom Name");
    expect(config.reasoning).toBe(false);
    expect(config.input).toEqual(["text"]);
    expect(config.contextWindow).toBe(8192);
    expect(config.maxTokens).toBe(4096);
    expect(config.cost).toEqual({
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    });
  });

});
