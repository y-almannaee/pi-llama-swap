import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { API_KEY_PLACEHOLDER, DEFAULT_LLAMA_SWAP_URL } from "../src/constants";
import { ModelsEndpoint, RawModel } from "../src/interfaces/endpoints/models";

// Mock the resolver module before importing retriever
vi.mock("../src/tools/resolver", () => ({
  resolveUrl: vi.fn(),
  resolveApiKey: vi.fn(),
}));

import * as resolver from "../src/tools/resolver";
import {
  isServerReady,
  rpc,
  listModels,
  validateResponse,
  validators,
} from "../src/tools/retriever";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockFetch = (response: { ok: boolean; status?: number; json?: unknown; text?: string }) => {
  const mockJson = response.json !== undefined
    ? vi.fn().mockResolvedValue(response.json)
    : vi.fn().mockResolvedValue(null);
  const mockText = response.text !== undefined
    ? vi.fn().mockResolvedValue(response.text as string)
    : vi.fn().mockResolvedValue("");

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status ?? (response.ok ? 200 : 500),
    json: mockJson,
    text: mockText,
  }));
};

const clearFetch = () => {
  vi.unstubAllGlobals();
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

describe("retriever", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    clearFetch();

    // Default resolver mocks
    vi.mocked(resolver.resolveUrl).mockResolvedValue(DEFAULT_LLAMA_SWAP_URL);
    vi.mocked(resolver.resolveApiKey).mockResolvedValue(API_KEY_PLACEHOLDER);
  });

  afterEach(() => {
    clearFetch();
  });

  // -----------------------------------------------------------------------
  // isServerReady
  // -----------------------------------------------------------------------

  describe("isServerReady", () => {
    it("should return true when /health returns 200", async () => {
      mockFetch({ ok: true });
      const result = await isServerReady();
      expect(result).toBe(true);
    });

    it("should return false when /health returns non-ok status", async () => {
      mockFetch({ ok: false, status: 503 });
      const result = await isServerReady();
      expect(result).toBe(false);
    });

    it("should return false when fetch throws (server unreachable)", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      const result = await isServerReady();
      expect(result).toBe(false);
    });

    it("should call fetch with /health endpoint and timeout signal", async () => {
      mockFetch({ ok: true });
      await isServerReady();

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[0]).toBe(`${DEFAULT_LLAMA_SWAP_URL}/health`);
      expect(call[1]).toHaveProperty("signal");
    });
  });

  // -----------------------------------------------------------------------
  // rpc
  // -----------------------------------------------------------------------

  describe("rpc", () => {
    it("should perform GET request when no body is provided", async () => {
      const mockData = { status: "ok" };
      mockFetch({ ok: true, json: mockData });

      const result = await rpc<{ status: string }>("/health");
      expect(result).toEqual(mockData);

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]).toMatchObject({ method: "GET" });
    });

    it("should perform POST request with JSON body when body is provided", async () => {
      const mockData = { id: "model-1" };
      mockFetch({ ok: true, json: mockData });

      const body = { action: "swap", model: "test" };
      await rpc("/swap", body);

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]).toMatchObject({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    });

    it("should include Authorization header when apiKey is set", async () => {
      const testKey = "sk-real-key-123";
      vi.mocked(resolver.resolveApiKey).mockResolvedValue(testKey);

      mockFetch({ ok: true, json: { ok: true } });
      await rpc("/test");

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1].headers).toMatchObject({
        Authorization: `Bearer ${testKey}`,
      });
    });

    it("should omit Authorization header when apiKey is placeholder", async () => {
      vi.mocked(resolver.resolveApiKey).mockResolvedValue(API_KEY_PLACEHOLDER);

      mockFetch({ ok: true, json: { ok: true } });
      await rpc("/test");

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1].headers).not.toHaveProperty("Authorization");
    });

    it("should omit Authorization header when apiKey is empty string", async () => {
      vi.mocked(resolver.resolveApiKey).mockResolvedValue("");

      mockFetch({ ok: true, json: { ok: true } });
      await rpc("/test");

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1].headers).not.toHaveProperty("Authorization");
    });

    it("should throw on non-ok response with status and body", async () => {
      mockFetch({ ok: false, status: 404, text: "Not Found" });

      await expect(rpc("/nonexistent")).rejects.toThrow("404: Not Found");
    });

    it("should throw on 500 response", async () => {
      mockFetch({ ok: false, status: 500, text: "Internal Server Error" });

      await expect(rpc("/error")).rejects.toThrow("500: Internal Server Error");
    });

    it("should construct correct URL from resolved base", async () => {
      const customUrl = "http://custom-host:9999";
      vi.mocked(resolver.resolveUrl).mockResolvedValue(customUrl);

      mockFetch({ ok: true, json: {} });
      await rpc("/custom/endpoint");

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[0]).toBe(`${customUrl}/custom/endpoint`);
    });

    it("should include timeout signal in request options", async () => {
      mockFetch({ ok: true, json: {} });
      await rpc("/test");

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[1]).toHaveProperty("signal");
    });

    it("should validate response when validator is provided", async () => {
      mockFetch({ ok: true, json: { object: "list", data: [] } });

      const result = await rpc<ModelsEndpoint>(
        "/v1/models",
        undefined,
        validators.ModelsEndpoint,
      );
      expect(result).toEqual({ object: "list", data: [] });
    });

    it("should throw when validator key is missing", async () => {
      mockFetch({ ok: true, json: { data: [] } });

      await expect(
        rpc<ModelsEndpoint>("/v1/models", undefined, validators.ModelsEndpoint),
      ).rejects.toThrow('Response is missing expected key "object"');
    });

    it("should throw when validator value mismatches", async () => {
      mockFetch({ ok: true, json: { object: "wrong", data: [] } });

      await expect(
        rpc<ModelsEndpoint>("/v1/models", undefined, validators.ModelsEndpoint),
      ).rejects.toThrow('Response key "object" has value "wrong", expected "list"');
    });

    it("should throw when response body is not an object", async () => {
      mockFetch({ ok: true, json: null });

      await expect(
        rpc("/test", undefined, { foo: "bar" }),
      ).rejects.toThrow("Response body is not an object");
    });

    it("should skip validation when no validator is provided", async () => {
      mockFetch({ ok: true, json: { anything: true } });

      const result = await rpc("/test");
      expect(result).toEqual({ anything: true });
    });
  });

  // -----------------------------------------------------------------------
  // validateResponse (unit)
  // -----------------------------------------------------------------------

  describe("validateResponse", () => {
    it("should pass when all keys match", () => {
      expect(() =>
        validateResponse({ status: "ok", extra: 1 }, { status: "ok" }),
      ).not.toThrow();
    });

    it("should throw on missing key", () => {
      expect(() =>
        validateResponse({ other: true }, { status: "ok" }),
      ).toThrow('Response is missing expected key "status"');
    });

    it("should throw on value mismatch", () => {
      expect(() =>
        validateResponse({ status: "error" }, { status: "ok" }),
      ).toThrow('Response key "status" has value "error", expected "ok"');
    });

    it("should throw on null input", () => {
      expect(() => validateResponse(null, { status: "ok" })).toThrow(
        "Response body is not an object",
      );
    });

    it("should throw on array input", () => {
      expect(() => validateResponse([1, 2], { status: "ok" })).toThrow(
        "Response body is not an object",
      );
    });

    it("should pass with empty schema", () => {
      expect(() => validateResponse({ anything: true }, {})).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // validators
  // -----------------------------------------------------------------------

  describe("validators", () => {
    it("should define ModelsEndpoint validator", () => {
      expect(validators.ModelsEndpoint).toEqual({ object: "list" });
    });

    it("should define HealthEndpoint validator", () => {
      expect(validators.HealthEndpoint).toEqual({ status: "ok" });
    });
  });

  // -----------------------------------------------------------------------
  // listModels
  // -----------------------------------------------------------------------

  describe("listModels", () => {
    it("should return model data array from /v1/models", async () => {
      const models: RawModel[] = [
        { id: "model-a", name: "Model A" },
        { id: "model-b", name: "Model B", context_window: 8192 },
      ];
      const endpointResponse: ModelsEndpoint = { object: "list", data: models };

      mockFetch({ ok: true, json: endpointResponse });

      const result = await listModels();
      expect(result).toEqual(models);
    });

    it("should call rpc with /v1/models endpoint", async () => {
      mockFetch({ ok: true, json: { object: "list", data: [] } });

      await listModels();

      const call = vi.mocked(globalThis.fetch).mock.calls[0];
      expect(call[0]).toBe(`${DEFAULT_LLAMA_SWAP_URL}/v1/models`);
    });

    it("should return empty array when no models available", async () => {
      mockFetch({ ok: true, json: { object: "list", data: [] } });

      const result = await listModels();
      expect(result).toEqual([]);
    });

    it("should propagate rpc errors", async () => {
      mockFetch({ ok: false, status: 500, text: "Server error" });

      await expect(listModels()).rejects.toThrow("500: Server error");
    });

    it("should handle models with meta information", async () => {
      const models: RawModel[] = [
        {
          id: "llama-3-8b",
          name: "Llama 3 8B",
          context_window: 8192,
          meta: {
            llamaswap: { context_length: 8192, upstream_port: 8081 },
          },
        },
      ];
      mockFetch({ ok: true, json: { object: "list", data: models } });

      const result = await listModels();
      expect(result).toHaveLength(1);
      expect(result[0].meta?.llamaswap?.upstream_port).toBe(8081);
    });
  });
});
