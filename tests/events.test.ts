import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PROVIDER_ID } from "../src/constants";
import { ModelSelectEvent } from "../src/interfaces/events";

// Mock the resolver module
vi.mock("../src/tools/resolver", () => ({
  refreshUrl: vi.fn().mockResolvedValue(undefined),
  resolveUrl: vi.fn().mockResolvedValue("http://127.0.0.1:8080"),
}));

// Mock the cache module
vi.mock("../src/tools/cache", () => ({
  setActiveModel: vi.fn(),
  mergeUpstreamMeta: vi.fn().mockResolvedValue(undefined),
}));

import { onModelSelect } from "../src/events";
import * as resolver from "../src/tools/resolver";
import * as cache from "../src/tools/cache";

describe("onModelSelect", () => {
  let mockNotify: ReturnType<typeof vi.fn>;
  let mockCtx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockNotify = vi.fn();
    mockCtx = {
      ui: {
        notify: mockNotify,
      },
    };
  });

  it("should notify when a llama-swap model is selected", async () => {
    const event: ModelSelectEvent = {
      model: { id: "Llama-3-8B", provider: PROVIDER_ID },
    };

    await onModelSelect(event, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith(
      `>> Using Llama-3-8B`,
      "info",
    );
  });

  it("should ignore non-llama-swap models", async () => {
    const event: ModelSelectEvent = {
      model: { id: "gpt-4", provider: "openai" },
    };

    await onModelSelect(event, mockCtx);

    expect(mockNotify).not.toHaveBeenCalled();
    expect(cache.mergeUpstreamMeta).not.toHaveBeenCalled();
  });

  it("should trigger non-blocking URL cache refresh on model select", async () => {
    const event: ModelSelectEvent = {
      model: { id: "Llama-3-8B", provider: PROVIDER_ID },
    };

    await onModelSelect(event, mockCtx);

    expect(vi.mocked(resolver.refreshUrl)).toHaveBeenCalledWith(
      process.cwd(),
    );
  });

  it("should not trigger URL cache refresh for non-llama-swap models", async () => {
    const event: ModelSelectEvent = {
      model: { id: "gpt-4", provider: "openai" },
    };

    await onModelSelect(event, mockCtx);

    expect(vi.mocked(resolver.refreshUrl)).not.toHaveBeenCalled();
  });

  it("should trigger upstream metadata fetch for active model", async () => {
    const event: ModelSelectEvent = {
      model: { id: "Qwen/Qwen3.6-27B-mmproj-ik", provider: PROVIDER_ID },
    };

    await onModelSelect(event, mockCtx);

    expect(cache.mergeUpstreamMeta).toHaveBeenCalledWith();
  });
});
