import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  API_KEY_PLACEHOLDER,
  DEFAULT_LLAMA_SWAP_URL,
  PROVIDER_ID,
} from "../src/constants";

// Use vi.mock with inline vi.fn() to avoid hoisting issues
vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  constants: { F_OK: 0 },
  readFile: vi.fn(),
}));

import * as fsPromises from "node:fs/promises";
import { resolveUrl, resolveApiKey, resetUrlCache, refreshUrl } from "../src/tools/resolver";

describe("URL resolution fallback chain", () => {
  beforeEach(() => {
    vi.mocked(fsPromises.access).mockReset();
    vi.mocked(fsPromises.readFile).mockReset();
    delete process.env.LLAMA_SWAP_URL;
    resetUrlCache();
  });

  it("should return default URL when no config is found", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fsPromises.readFile).mockResolvedValue("");

    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe(DEFAULT_LLAMA_SWAP_URL);
  });

  it("should prioritize project config over env variable", async () => {
    process.env.LLAMA_SWAP_URL = "http://env-url:8080";

    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("llama-swap.json")) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ url: "http://localhost:9999" }),
    );

    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe("http://localhost:9999");
  });

  it("should use env variable when no project config exists", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fsPromises.readFile).mockResolvedValue("");
    process.env.LLAMA_SWAP_URL = "http://env-url:8080";

    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe("http://env-url:8080");
  });

  it("should use global settings when no project config or env exists", async () => {
    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("settings.json")) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ llamaSwapUrl: "http://global:8080" }),
    );

    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe("http://global:8080");
  });

  it("should strip trailing slashes from resolved URL", async () => {
    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("llama-swap.json")) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ url: "http://localhost:8080/" }),
    );

    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe("http://localhost:8080");
  });
});

describe("refreshUrl", () => {
  beforeEach(() => {
    vi.mocked(fsPromises.access).mockReset();
    vi.mocked(fsPromises.readFile).mockReset();
    delete process.env.LLAMA_SWAP_URL;
    resetUrlCache();
  });

  it("should invalidate cache and re-resolve URL", async () => {
    // First resolution from project config
    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("llama-swap.json")) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ url: "http://first-url:8080" }),
    );

    const first = await resolveUrl("/tmp/test-project");
    expect(first).toBe("http://first-url:8080");

    // Change config to a new URL
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ url: "http://second-url:9090" }),
    );

    // refreshUrl should invalidate cache and pick up the new URL
    await refreshUrl("/tmp/test-project");
    const second = await resolveUrl("/tmp/test-project");
    expect(second).toBe("http://second-url:9090");
  });

  it("should return default URL on refresh when no config found", async () => {
    // First resolution from project config
    vi.mocked(fsPromises.access).mockImplementation((path: string) => {
      if (typeof path === "string" && path.includes("llama-swap.json")) {
        return Promise.resolve();
      }
      return Promise.reject(new Error("ENOENT"));
    });
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ url: "http://configured:8080" }),
    );

    const first = await resolveUrl("/tmp/test-project");
    expect(first).toBe("http://configured:8080");

    // Simulate config file being removed
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));

    // refreshUrl should fall back to default
    await refreshUrl("/tmp/test-project");
    const second = await resolveUrl("/tmp/test-project");
    expect(second).toBe(DEFAULT_LLAMA_SWAP_URL);
  });

  it("should be safe to call when cache is empty", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fsPromises.readFile).mockResolvedValue("");

    // Should not throw even with no prior resolution
    await refreshUrl("/tmp/test-project");
    const result = await resolveUrl("/tmp/test-project");
    expect(result).toBe(DEFAULT_LLAMA_SWAP_URL);
  });
});

describe("API key resolution", () => {
  beforeEach(() => {
    vi.mocked(fsPromises.access).mockReset();
    vi.mocked(fsPromises.readFile).mockReset();
  });

  it("should return placeholder when auth file does not exist", async () => {
    vi.mocked(fsPromises.access).mockRejectedValue(new Error("ENOENT"));
    vi.mocked(fsPromises.readFile).mockResolvedValue("");

    const result = await resolveApiKey();
    expect(result).toBe(API_KEY_PLACEHOLDER);
  });

  it("should return placeholder when provider key is missing", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ "other-provider": { key: "other-key" } }),
    );

    const result = await resolveApiKey();
    expect(result).toBe(API_KEY_PLACEHOLDER);
  });

  it("should return the provider key when present", async () => {
    vi.mocked(fsPromises.access).mockResolvedValue(undefined);
    vi.mocked(fsPromises.readFile).mockResolvedValue(
      JSON.stringify({ [PROVIDER_ID]: { key: "test-api-key" } }),
    );

    const result = await resolveApiKey();
    expect(result).toBe("test-api-key");
  });
});
