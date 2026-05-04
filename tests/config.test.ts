import { vi, describe, expect, it, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof fs>();
  return {
    ...actual,
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

import {
  getModelOverride,
  readConfig,
  setModelOverride,
  writeConfig,
  type ModelConfig,
} from "../src/config";

// Re-import after mock is hoisted
const mockedFs = await import("node:fs");

describe("getModelOverride", () => {
  it("returns empty object for unknown model", () => {
    const config: ModelConfig = { models: {} };
    const override = getModelOverride(config, "unknown-model");
    expect(override).toEqual({});
  });

  it("returns stored override for known model", () => {
    const config: ModelConfig = {
      models: {
        "my-model": {
          displayName: "Custom Name",
          contextWindow: 65536,
          reasoning: false,
        },
      },
    };
    const override = getModelOverride(config, "my-model");
    expect(override.displayName).toBe("Custom Name");
    expect(override.contextWindow).toBe(65536);
    expect(override.reasoning).toBe(false);
  });
});

describe("setModelOverride", () => {
  it("adds new model override", () => {
    const config: ModelConfig = { models: {} };
    const updated = setModelOverride(config, "new-model", {
      displayName: "New Model",
      hasImage: true,
    });

    expect(updated.models["new-model"]).toBeDefined();
    expect(updated.models["new-model"]?.displayName).toBe("New Model");
    expect(updated.models["new-model"]?.hasImage).toBe(true);
  });

  it("updates existing model override", () => {
    const config: ModelConfig = {
      models: {
        "my-model": { displayName: "Old Name" },
      },
    };
    const updated = setModelOverride(config, "my-model", {
      displayName: "New Name",
      contextWindow: 32768,
    });

    expect(updated.models["my-model"]?.displayName).toBe("New Name");
    expect(updated.models["my-model"]?.contextWindow).toBe(32768);
  });

  it("preserves other models", () => {
    const config: ModelConfig = {
      models: {
        "model-a": { displayName: "Model A" },
        "model-b": { displayName: "Model B" },
      },
    };
    const updated = setModelOverride(config, "model-a", {
      displayName: "Updated A",
    });

    expect(updated.models["model-a"]?.displayName).toBe("Updated A");
    expect(updated.models["model-b"]?.displayName).toBe("Model B");
  });
});

describe("writeConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true on success", () => {
    (mockedFs.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
      () => {},
    );
    const config: ModelConfig = { models: {} };
    const result = writeConfig(config);
    expect(result).toBe(true);
  });

  it("returns false when writeFileSync throws", () => {
    (mockedFs.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("EACCES");
      },
    );
    const config: ModelConfig = {
      models: { test: { displayName: "Test" } },
    };
    const result = writeConfig(config);
    expect(result).toBe(false);
  });

  it("calls writeFileSync with correct arguments", () => {
    (mockedFs.writeFileSync as ReturnType<typeof vi.fn>).mockImplementation(
      () => {},
    );
    const config: ModelConfig = { models: { a: { displayName: "A" } } };
    writeConfig(config);
    expect(mockedFs.writeFileSync).toHaveBeenCalledWith(
      expect.any(String),
      JSON.stringify(config, null, 2) + "\n",
      "utf-8",
    );
  });
});

describe("readConfig", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty config when file does not exist", () => {
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockImplementation(
      () => {
        throw new Error("ENOENT");
      },
    );
    const result = readConfig();
    expect(result).toEqual({ models: {} });
  });

  it("returns empty config when JSON is invalid", () => {
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      "not valid json",
    );
    const result = readConfig();
    expect(result).toEqual({ models: {} });
  });

  it("returns empty config when models is a string", () => {
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ models: "not-an-object" }),
    );
    const result = readConfig();
    expect(result).toEqual({ models: {} });
  });

  it("returns empty config when models is an array", () => {
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ models: ["a", "b"] }),
    );
    const result = readConfig();
    expect(result).toEqual({ models: {} });
  });

  it("returns empty config when models is null", () => {
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ models: null }),
    );
    const result = readConfig();
    expect(result).toEqual({ models: {} });
  });

  it("returns valid config when models is a proper object", () => {
    const validConfig = {
      models: {
        "my-model": { displayName: "My Model", contextWindow: 8192 },
      },
    };
    (mockedFs.readFileSync as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify(validConfig),
    );
    const result = readConfig();
    expect(result).toEqual(validConfig);
  });
});
