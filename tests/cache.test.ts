import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  getModels,
  fetchFresh,
  resetCache,
  mergeUpstreamMeta,
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

describe("mergeUpstreamMeta", () => {
  const modelWithUpstreamPort = {
    id: "model-x",
    name: "Model X",
    meta: { llamaswap: { upstream_port: 5000 } },
  };

  beforeEach(() => {
    resetCache();
    vi.restoreAllMocks();
  });

  it("should use http:// when baseUrl uses http", async () => {
    const upstreamResp = {
      ok: true,
      json: async () => ({ data: [{ id: "upstream-1" }] }),
    };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      upstreamResp as Response,
    );

    vi.spyOn(retriever, "listModels").mockResolvedValue([modelWithUpstreamPort]);
    await fetchFresh();

    await mergeUpstreamMeta("http://host:8080");
    // host includes port from baseUrl; verify protocol is http
    const calls = fetchSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastUrl = calls[calls.length - 1][0] as string;
    expect(lastUrl).toMatch(/^http:\/\//);
  });

  it("should use https:// when baseUrl uses https", async () => {
    const upstreamResp = {
      ok: true,
      json: async () => ({ data: [{ id: "upstream-1" }] }),
    };
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      upstreamResp as Response,
    );

    vi.spyOn(retriever, "listModels").mockResolvedValue([modelWithUpstreamPort]);
    await fetchFresh();

    await mergeUpstreamMeta("https://secure-host:8080");
    const calls = fetchSpy.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const lastUrl = calls[calls.length - 1][0] as string;
    expect(lastUrl).toMatch(/^https:\/\//);
  });

  it("should skip models without upstream_port", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    vi.spyOn(retriever, "listModels").mockResolvedValue([
      { id: "no-port", name: "No Port" },
    ]);
    await fetchFresh();

    await mergeUpstreamMeta("http://host:8080");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("should do nothing when cache is empty", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await mergeUpstreamMeta("http://host:8080");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
