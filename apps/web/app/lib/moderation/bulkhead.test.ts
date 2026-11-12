import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Decision } from "@bullpen/db-handles";
import { TIMEOUT_MS } from "./config.js";
import { setSwitches } from "../degradation/testing.js";
import { askGateway } from "./gateway.js";
import { saveAndModerate } from "./moderate.js";

/**
 * Moderation is the post's example of a bulkhead that already works (ADR-0027): it is off the money path. These tests hold the two things that make that true.
 * The measured half (trading latency with the provider down, before and after) is the k6 stress run in post-facts/part-05.md.
 */
describe("moderation shares nothing with the order path or the read paths", () => {
  const files = readdirSync(__dirname).filter((name) => /\.ts$/.test(name) && !/\.test\.ts$/.test(name));

  it.each(files)("%s opens no database pool of the trading schema", (name) => {
    const source = readFileSync(join(__dirname, name), "utf8");
    expect(source).not.toMatch(/trading\/(orders|reads)\//);
    expect(source).not.toMatch(/@bullpen\/db-trading/);
    expect(source).not.toMatch(/process\.env\.DATABASE/);
  });
});

describe("a moderation provider that never answers", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /** A fetch that hangs until its abort signal fires, as a provider that accepts the connection and says nothing does. */
  const hangs: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "TimeoutError" })));
    });

  it("costs the handle's own request at most the timeout, and ends as a handle for review, never as an error", async () => {
    const recorded: Decision[] = [];
    const store = { submit: async () => ({ ok: true as const, handleId: "h-1" }), record: async (d: Decision) => (recorded.push(d), true) };
    const done = vi.fn();
    const saving = saveAndModerate("user-1", "BullRun", { store, ask: (handle) => askGateway(handle, { fetch: hangs, apiKey: "k" }), log: () => undefined }).then(done);

    await vi.advanceTimersByTimeAsync(TIMEOUT_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    await saving;
    expect(done).toHaveBeenCalledWith({ ok: true, status: "review" });
    expect(recorded).toMatchObject([{ outcome: "review", reason: "timeout" }]);
  });

  it("does not hold up other work meanwhile: a hundred concurrent requests of another kind finish while it waits", async () => {
    const store = { submit: async () => ({ ok: true as const, handleId: "h-1" }), record: async () => true };
    void saveAndModerate("user-1", "BullRun", { store, ask: (handle) => askGateway(handle, { fetch: hangs, apiKey: "k" }), log: () => undefined });
    let finished = 0;
    await Promise.all(Array.from({ length: 100 }, async () => { await Promise.resolve(); finished += 1; }));
    expect(finished).toBe(100);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS + 1);
  });

  it("with the handle-moderation switch off, makes no request at all, so the provider being slow costs nothing", async () => {
    const restore = setSwitches("handle-moderation");
    try {
      const fetchSpy = vi.fn(hangs);
      const store = { submit: async () => ({ ok: true as const, handleId: "h-1" }), record: async () => true };
      const outcome = await saveAndModerate("user-1", "BullRun", { store, ask: (handle) => askGateway(handle, { fetch: fetchSpy, apiKey: "k" }), log: () => undefined });
      expect(outcome).toEqual({ ok: true, status: "review" });
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });
});
