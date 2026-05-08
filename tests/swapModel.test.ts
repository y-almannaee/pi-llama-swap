import { describe, expect, it } from "vitest";
import { DEFAULT_CTX, MAX_TOKENS } from "../src/constants";
import { RawModel } from "../src/interfaces/endpoints/models";
import {
  SwapModel,
  detectImageCapability,
  detectImageCapabilityFromCmd,
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

  it("returns isRunning false by default", () => {
    const model = new SwapModel(createRawModel());
    expect(model.isRunning).toBe(false);
  });

  it("returns isRunning true when set", () => {
    const model = new SwapModel({
      id: "test-model",
      meta: { llamaswap: { isRunning: true, runningState: "ready" } },
    } as RawModel);
    expect(model.isRunning).toBe(true);
    expect(model.runningState).toBe("ready");
  });

  it("returns runningState undefined when not running", () => {
    const model = new SwapModel(createRawModel());
    expect(model.runningState).toBeUndefined();
  });

  it("returns runningCmd when set", () => {
    const model = new SwapModel({
      id: "test-model",
      meta: {
        llamaswap: {
          isRunning: true,
          runningState: "ready",
          runningCmd: "llama-server --port 5001",
        },
      },
    } as RawModel);
    expect(model.runningCmd).toBe("llama-server --port 5001");
  });

  it("returns runningCmd undefined when not set", () => {
    const model = new SwapModel(createRawModel());
    expect(model.runningCmd).toBeUndefined();
  });

  it("uses cmd detection when running (mmproj flag → true)", () => {
    const model = new SwapModel({
      id: "text-only-model",
      meta: {
        llamaswap: {
          isRunning: true,
          runningCmd: "llama-server -m model.gguf --mmproj proj.gguf",
        },
      },
    } as RawModel);
    expect(model.hasImage).toBe(true);
  });

  it("uses cmd detection when running (no-mmproj flag → false)", () => {
    const model = new SwapModel({
      id: "Qwen3-32B-mmproj",
      meta: {
        llamaswap: {
          isRunning: true,
          runningCmd: "llama-server -m model.gguf --no-mmproj",
        },
      },
    } as RawModel);
    expect(model.hasImage).toBe(false);
  });

  it("falls back to ID detection when no cmd present", () => {
    const model = new SwapModel(
      createRawModel({ id: "Qwen3-32B-mmproj" }),
    );
    expect(model.hasImage).toBe(true);

    const textModel = new SwapModel(
      createRawModel({ id: "Llama-3-8B" }),
    );
    expect(textModel.hasImage).toBe(false);
  });

  it("falls back to ID detection when cmd has no mmproj flags", () => {
    const model = new SwapModel({
      id: "Qwen3-32B-mmproj",
      meta: {
        llamaswap: {
          isRunning: true,
          runningCmd: "llama-server -m model.gguf --ctx-size 131072",
        },
      },
    } as RawModel);
    expect(model.hasImage).toBe(true); // ID detection kicks in
  });
});

describe("detectImageCapabilityFromCmd", () => {
  it("returns true for --mmproj FILE", () => {
    expect(detectImageCapabilityFromCmd("llama-server --mmproj proj.gguf")).toBe(true);
  });

  it("returns true for -mm FILE (short flag)", () => {
    expect(detectImageCapabilityFromCmd("llama-server -mm proj.gguf")).toBe(true);
  });

  it("returns true for -mmu URL (short flag for mmproj-url)", () => {
    expect(detectImageCapabilityFromCmd("llama-server -mmu http://host/proj.gguf")).toBe(true);
  });

  it("returns true for --mmproj-url URL", () => {
    expect(detectImageCapabilityFromCmd("llama-server --mmproj-url http://host/proj.gguf")).toBe(true);
  });

  it("returns true for --mmproj-auto", () => {
    expect(detectImageCapabilityFromCmd("llama-server --mmproj-auto")).toBe(true);
  });

  it("returns false for --no-mmproj", () => {
    expect(detectImageCapabilityFromCmd("llama-server --no-mmproj")).toBe(false);
  });

  it("returns false for --no-mmproj-auto", () => {
    expect(detectImageCapabilityFromCmd("llama-server --no-mmproj-auto")).toBe(false);
  });

  it("disable flag takes precedence over enable flag", () => {
    expect(detectImageCapabilityFromCmd("llama-server --mmproj proj.gguf --no-mmproj")).toBe(false);
  });

  it("returns null when no mmproj flags present", () => {
    expect(detectImageCapabilityFromCmd("llama-server -m model.gguf -t 14")).toBe(null);
  });

  it("handles --no-mmproj but not --no-mmproj-auto", () => {
    // --no-mmproj (without -auto suffix) should match
    expect(detectImageCapabilityFromCmd("llama-server --no-mmproj")).toBe(false);
    // --no-mmproj-auto should also match (separate check)
    expect(detectImageCapabilityFromCmd("llama-server --no-mmproj-auto")).toBe(false);
    // --mmproj-auto should NOT match the --no-mmproj pattern
    expect(detectImageCapabilityFromCmd("llama-server --mmproj-auto")).toBe(true);
  });

  it("handles multiline cmd (from YAML config)", () => {
    const cmd = "llama-server\\n  --port 5801\\n  -mm proj.gguf\\n  -t 14";
    expect(detectImageCapabilityFromCmd(cmd)).toBe(true);
  });

  it("handles -mm not matching inside other words", () => {
    expect(detectImageCapabilityFromCmd("llama-server --commit abc")).toBe(null);
    expect(detectImageCapabilityFromCmd("llama-server --model test-mm-test")).toBe(null);
  });
});
