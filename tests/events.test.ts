import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { PROVIDER_ID } from "../src/constants";
import { ModelSelectEvent } from "../src/interfaces/events";

// Mock the resolver module
vi.mock("../src/tools/resolver", () => ({
  refreshUrl: vi.fn().mockResolvedValue(undefined),
}));

import { onModelSelect } from "../src/events";
import * as resolver from "../src/tools/resolver";

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

  it("should notify when a llama-swap model is selected", () => {
    const event: ModelSelectEvent = {
      model: { id: "Llama-3-8B", provider: PROVIDER_ID },
    };

    onModelSelect(event, mockCtx);

    expect(mockNotify).toHaveBeenCalledWith(
      `>> Using Llama-3-8B`,
      "info",
    );
  });

  it("should ignore non-llama-swap models", () => {
    const event: ModelSelectEvent = {
      model: { id: "gpt-4", provider: "openai" },
    };

    onModelSelect(event, mockCtx);

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("should trigger non-blocking URL cache refresh on model select", () => {
    const event: ModelSelectEvent = {
      model: { id: "Llama-3-8B", provider: PROVIDER_ID },
    };

    onModelSelect(event, mockCtx);

    expect(vi.mocked(resolver.refreshUrl)).toHaveBeenCalledWith(
      process.cwd(),
    );
  });

  it("should not trigger URL cache refresh for non-llama-swap models", () => {
    const event: ModelSelectEvent = {
      model: { id: "gpt-4", provider: "openai" },
    };

    onModelSelect(event, mockCtx);

    expect(vi.mocked(resolver.refreshUrl)).not.toHaveBeenCalled();
  });
});
