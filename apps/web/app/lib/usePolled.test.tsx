import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePolled } from "./usePolled.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("usePolled", () => {
  it("starts loading, then holds the JSON the route answered", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ n: 1 }) }));
    const { result } = renderHook(() => usePolled<{ n: number }>("/x", 60_000, "down"));
    expect(result.current).toEqual({ status: "loading" });
    await waitFor(() => expect(result.current).toEqual({ status: "ok", data: { n: 1 } }));
  });

  it("keeps the HTTP status and the route's own message on a failure, and falls back when there is none", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({ error: "Leaderboard unavailable." }) }));
    const { result } = renderHook(() => usePolled("/x", 60_000, "fallback"));
    await waitFor(() => expect(result.current).toEqual({ status: "error", httpStatus: 503, message: "Leaderboard unavailable." }));

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => { throw new Error("not json"); } }));
    const second = renderHook(() => usePolled("/y", 60_000, "fallback"));
    await waitFor(() => expect(second.result.current).toEqual({ status: "error", httpStatus: 500, message: "fallback" }));
  });

  it("reports a network failure without a status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { result } = renderHook(() => usePolled("/x", 60_000, "fallback"));
    await waitFor(() => expect(result.current).toEqual({ status: "error", httpStatus: null, message: "fallback" }));
  });

  it("asks again every interval, and a failure replaces an earlier success", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ n: 1 }) }).mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePolled("/x", 1000, "down"));
    await waitFor(() => expect(result.current.status).toBe("ok"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
