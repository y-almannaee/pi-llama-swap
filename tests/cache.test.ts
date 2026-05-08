import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getModels,
  fetchFresh,
  resetCache,
  mergeUpstreamMeta,
  setActiveModel,
  getActiveModelId,
  fetchRunningState,
  mergeRunningState,
  getRunningStateForModel,
  isModelRunning,
} from "../src/tools/cache";
import * as retriever from "../src/tools/retriever";

const mockModels = [
  { id: "model-a", name: "Model A" },
  { id: "model-b", name: "Model B" },
];

beforeEach(() => {
  resetCache();
  vi.restoreAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("stale-while-revalidate cache", () => {
  it("should fetch fresh on first call", async () => {
    vi.spyOn(retriever, "listModels").mockResolvedValue(mockModels);
    const models = await fetchFresh();
    expect(models).toEqual(mockModels);
    expect(retriever.listModels).toHaveBeenCalledTimes(1);
  });

  it("should return cached data instantly on second call", async () => {
    vi.spyOn(retriever, "listModels").mockResolvedValue(mockModels);
    await fetchFresh();
    expect(retriever.listModels).toHaveBeenCalledTimes(1);

    // Second call should use cache — listModels not called again
    const models = await getModels();
    expect(models).toEqual(mockModels);
    expect(retriever.listModels).toHaveBeenCalledTimes(1); // still 1
  });

  it("should return stale data if background refresh fails", async () => {
    const spy = vi.spyOn(retriever, "listModels");
    spy.mockResolvedValueOnce(mockModels); // First fetch succeeds
    await fetchFresh();

    // Advance time past freshness window (5 min)
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    // Next fetch fails
    spy.mockRejectedValueOnce(new Error("network error"));

    // Should still return stale data
    const models = await getModels();
    expect(models).toEqual(mockModels);
  });

  it("should return empty array if no cache and fetch fails", async () => {
    vi.spyOn(retriever, "listModels").mockRejectedValue(
      new Error("network error"),
    );
    const models = await fetchFresh();
    expect(models).toEqual([]);
  });

  it("should trigger background refresh when stale", async () => {
    const spy = vi.spyOn(retriever, "listModels").mockResolvedValue(mockModels);
    await fetchFresh();
    expect(spy).toHaveBeenCalledTimes(1);

    // Advance time past freshness window
    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    // getModels should return cached data and trigger background refresh
    const models = await getModels();
    expect(models).toEqual(mockModels);
    // Background refresh fires (may resolve after await due to timers)
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("should not duplicate background refresh", async () => {
    const spy = vi.spyOn(retriever, "listModels").mockResolvedValue(mockModels);
    await fetchFresh();
    expect(spy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

    // Two rapid calls should trigger only one background refresh
    await Promise.all([getModels(), getModels()]);
    await vi.advanceTimersByTimeAsync(0);
    expect(spy).toHaveBeenCalledTimes(2); // 1 initial + 1 background
  });
});

describe("running state", () => {
  it("should fetch and cache running state", async () => {
    vi.spyOn(retriever, "listRunningModels").mockResolvedValue({
      running: [
        { model: "model-a", state: "ready", proxy: "http://localhost:5001" },
        { model: "model-c", state: "loading", proxy: "http://localhost:5002" },
      ],
    });

    const entries = await fetchRunningState();
    expect(entries).toHaveLength(2);
    expect(entries[0].model).toBe("model-a");
    expect(entries[0].state).toBe("ready");
  });

  it("should cache running state and not re-fetch", async () => {
    const spy = vi
      .spyOn(retriever, "listRunningModels")
      .mockResolvedValue({
        running: [{ model: "model-a", state: "ready" }],
      });

    await fetchRunningState();
    await fetchRunningState();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("should return empty array when /running fails", async () => {
    vi.spyOn(retriever, "listRunningModels").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    const entries = await fetchRunningState();
    expect(entries).toEqual([]);
  });

  it("should filter out null/undefined model IDs", async () => {
    vi.spyOn(retriever, "listRunningModels").mockResolvedValue({
      running: [
        { model: "model-a", state: "ready" },
        { model: undefined, state: "error" },
      ],
    });

    const entries = await fetchRunningState();
    expect(entries.filter((e) => e.model)).toHaveLength(1);
  });

  it("isModelRunning should match by base ID (variants share state)", async () => {
    vi.spyOn(retriever, "listRunningModels").mockResolvedValue({
      running: [{ model: "Llama-3-8B", state: "ready" }],
    });

    expect(await isModelRunning("Llama-3-8B")).toBe(true);
    expect(await isModelRunning("Llama-3-8B:precise")).toBe(true);
    expect(await isModelRunning("Llama-3-8B:general")).toBe(true);
    expect(await isModelRunning("Mistral-7B")).toBe(false);
  });

  it("should return false when /running fails", async () => {
    vi.spyOn(retriever, "listRunningModels").mockRejectedValue(
      new Error("ECONNREFUSED"),
    );

    expect(await isModelRunning("model-a")).toBe(false);
  });
});

describe("mergeRunningState", () => {
  function createModels() {
    return [
      { id: "Llama-3-8B", name: "Llama 3 8B", meta: { llamaswap: {} } },
      { id: "Llama-3-8B:precise", name: "Llama 3 8B Precise", meta: { llamaswap: {} } },
      { id: "Mistral-7B", name: "Mistral 7B", meta: { llamaswap: {} } },
    ];
  }

  it("should mark running models and their variants", () => {
    const models = createModels();
    mergeRunningState(models, [
      { model: "Llama-3-8B", state: "ready", ttl: 10800 },
    ]);

    expect(models[0].meta!.llamaswap!.isRunning).toBe(true);
    expect(models[0].meta!.llamaswap!.runningState).toBe("ready");
    expect(models[0].meta!.llamaswap!.runningTtl).toBe(10800);
    // Variant should also be marked as running
    expect(models[1].meta!.llamaswap!.isRunning).toBe(true);
    expect(models[1].meta!.llamaswap!.runningState).toBe("ready");
    // Non-running model
    expect(models[2].meta!.llamaswap!.isRunning).toBe(false);
    expect(models[2].meta!.llamaswap!.runningState).toBeUndefined();
  });

  it("should store cmd from running entry", () => {
    const models = createModels();
    mergeRunningState(models, [
      {
        model: "Llama-3-8B",
        state: "ready",
        cmd: "llama-server --port 5001 -m model.gguf",
      },
    ]);

    const cmd = (models[0].meta!.llamaswap! as Record<string, unknown>).runningCmd;
    expect(cmd).toBe("llama-server --port 5001 -m model.gguf");
  });

  it("should handle running entry with variant ID", () => {
    const models = createModels();
    mergeRunningState(models, [
      { model: "Llama-3-8B:precise", state: "loading" },
    ]);

    // Both base and variant should be marked as running
    expect(models[0].meta!.llamaswap!.isRunning).toBe(true);
    expect(models[0].meta!.llamaswap!.runningState).toBe("loading");
    expect(models[1].meta!.llamaswap!.isRunning).toBe(true);
    expect(models[1].meta!.llamaswap!.runningState).toBe("loading");
  });

  it("should clear stale running state when model is no longer running", () => {
    const models = createModels();
    // First merge — model is running
    mergeRunningState(models, [
      { model: "Llama-3-8B", state: "ready" },
    ]);
    expect(models[0].meta!.llamaswap!.isRunning).toBe(true);

    // Second merge — model is no longer running
    mergeRunningState(models, []);
    expect(models[0].meta!.llamaswap!.isRunning).toBe(false);
    expect(models[0].meta!.llamaswap!.runningState).toBeUndefined();
  });

  it("should handle models without meta block", () => {
    const models = [
      { id: "bare-model", name: "Bare Model" },
    ];
    mergeRunningState(models, [
      { model: "bare-model", state: "ready" },
    ]);

    expect(models[0].meta!.llamaswap!.isRunning).toBe(true);
  });
});

describe("getRunningStateForModel", () => {
  it("should return running state for a model", () => {
    const models = [
      {
        id: "model-x",
        meta: {
          llamaswap: {
            isRunning: true,
            runningState: "ready",
            runningCmd: "llama-server --port 5001",
          },
        },
      },
    ];

    const state = getRunningStateForModel(models, "model-x");
    expect(state).toEqual({
      isRunning: true,
      state: "ready",
      cmd: "llama-server --port 5001",
    });
  });

  it("should return not running for a model without state", () => {
    const models = [{ id: "model-x" }];
    const state = getRunningStateForModel(models, "model-x");
    expect(state).toEqual({ isRunning: false });
  });

  it("should return null for unknown model", () => {
    const models = [{ id: "model-x" }];
    const state = getRunningStateForModel(models, "unknown");
    expect(state).toBeNull();
  });
});

describe("mergeUpstreamMeta", () => {
  // Factory to create fresh model copies (prevents cross-test state leakage)
  function createModel(overrides = {}) {
    return {
      id: "model-x",
      name: "Model X",
      ...overrides,
    };
  }

  let listModelsSpy: ReturnType<typeof vi.spyOn>;
  let listRunningSpy: ReturnType<typeof vi.spyOn>;
  let fetchUpstreamMetaSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    resetCache();
    listModelsSpy = vi
      .spyOn(retriever, "listModels")
      .mockReturnValue(Promise.resolve([createModel()]));
    listRunningSpy = vi
      .spyOn(retriever, "listRunningModels")
      .mockResolvedValue({ running: [] });
    fetchUpstreamMetaSpy = vi
      .spyOn(retriever, "fetchUpstreamMeta")
      .mockResolvedValue(null);
  });

  function setUpstreamModel(model: { meta?: unknown; max_model_len?: number }): void {
    const rawModel = { id: "upstream-model", ...model };
    fetchUpstreamMetaSpy.mockResolvedValue(rawModel);
  }

  it("should do nothing when no active model is set", async () => {
    await fetchFresh();
    await mergeUpstreamMeta();
    expect(fetchUpstreamMetaSpy).not.toHaveBeenCalled();
  });

  it("should use /upstream/:id when model is running", async () => {
    setUpstreamModel({ meta: { n_ctx_train: 131072 } });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "model-x", state: "ready" }],
    });
    await fetchFresh();
    setActiveModel("model-x");

    await mergeUpstreamMeta();

    expect(fetchUpstreamMetaSpy).toHaveBeenCalledWith("model-x");
  });

  it("should skip when model is NOT running (no fallback)", async () => {
    listRunningSpy.mockResolvedValue({ running: [] });
    await fetchFresh();
    setActiveModel("model-x");

    await mergeUpstreamMeta();

    // Should NOT call upstream proxy — model not running, would trigger swap
    expect(fetchUpstreamMetaSpy).not.toHaveBeenCalled();
  });

  it("should merge upstream metadata on success", async () => {
    setUpstreamModel({
      meta: { n_ctx_train: 262144, n_embd: 2048, n_vocab: 248320 },
      max_model_len: 262144,
    });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "model-x", state: "ready" }],
    });
    await fetchFresh();
    setActiveModel("model-x");

    await mergeUpstreamMeta();

    const cached = await getModels();
    const merged = cached[0];
    expect(merged.meta?.upstream?.n_ctx_train).toBe(262144);
    expect(merged.meta?.upstream?.n_embd).toBe(2048);
    expect(merged.meta?.upstream?.n_vocab).toBe(248320);
    expect(merged.max_model_len).toBe(262144);
  });

  it("should merge arbitrary numeric fields from meta (backend-agnostic)", async () => {
    setUpstreamModel({
      meta: {
        n_ctx_train: 131072,
        custom_field: 42,
        another_field: 999,
        string_field: "ignored",
      },
      max_model_len: 131072,
    });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "model-x", state: "ready" }],
    });
    await fetchFresh();
    setActiveModel("model-x");

    await mergeUpstreamMeta();

    const cached = await getModels();
    const upstream = cached[0].meta?.upstream;
    expect(upstream?.n_ctx_train).toBe(131072);
    expect(upstream?.custom_field).toBe(42);
    expect(upstream?.another_field).toBe(999);
    // Non-numeric fields should not be captured
    expect(upstream?.string_field).toBeUndefined();
  });

  it("should do nothing when cache is empty", async () => {
    resetCache();
    await mergeUpstreamMeta();
    expect(fetchUpstreamMetaSpy).not.toHaveBeenCalled();
  });

  it("should reset active model and running cache on resetCache", async () => {
    setActiveModel("model-x");
    expect(getActiveModelId()).toBe("model-x");
    resetCache();
    expect(getActiveModelId()).toBeNull();
  });

  it("should retry and succeed when upstream is initially unavailable", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    fetchUpstreamMetaSpy.mockImplementation(async () => {
      callCount++;
      if (callCount < 3) {
        return null; // Simulates upstream not ready
      }
      return {
        id: "model.gguf",
        meta: { n_ctx_train: 131072 },
      };
    });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "model-x", state: "ready" }],
    });
    await fetchFresh();
    setActiveModel("model-x");

    const mergePromise = mergeUpstreamMeta();
    // Advance timers to trigger retries (delays: 2s, 4s, 8s...)
    await vi.advanceTimersByTimeAsync(15000);
    await mergePromise;
    vi.useRealTimers();

    // Should have retried and eventually succeeded
    expect(callCount).toBe(3);
    const models = await getModels();
    expect(models[0].meta?.upstream?.n_ctx_train).toBe(131072);
  });

  it("should encode model IDs with slashes for /upstream/:id", async () => {
    setUpstreamModel({ meta: { n_ctx_train: 131072 } });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "author/model-x", state: "ready" }],
    });
    listModelsSpy.mockResolvedValue([
      createModel({ id: "author/model-x" }),
    ]);
    await fetchFresh();
    setActiveModel("author/model-x");

    await mergeUpstreamMeta();

    expect(fetchUpstreamMetaSpy).toHaveBeenCalledWith("author/model-x");
  });

  it("should match running state by base ID (variants)", async () => {
    setUpstreamModel({ meta: { n_ctx_train: 131072 } });
    listRunningSpy.mockResolvedValue({
      running: [{ model: "model-x", state: "ready" }],
    });
    listModelsSpy.mockResolvedValue([
      createModel({ id: "model-x:precise" }),
    ]);
    await fetchFresh();
    setActiveModel("model-x:precise");

    await mergeUpstreamMeta();

    // Should call upstream with the variant ID (not the base)
    expect(fetchUpstreamMetaSpy).toHaveBeenCalledWith("model-x:precise");
  });
});
