import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool as createHandlesPool, listReviewQueue, readOwnHandle, recordDecision, resolveReview, submitHandle } from "@bullpen/db-handles";
import { createPool as createTradingPool, ensurePlayerAccount, neutralHandle, refreshLeaderboard, readLeaderboardRows } from "@bullpen/db-trading";

const urls = inject("dbUrls");
const handles = createHandlesPool(urls.handlesOwner);
const trading = createTradingPool(urls.tradingOwner);
afterAll(async () => {
  await handles.end();
  await trading.end();
});

const user = (): string => `user-${randomUUID()}`;
const name = (): string => `h${randomUUID().replaceAll("-", "").slice(0, 12)}`;

describe("saving a handle", () => {
  it("saves it as pending, and refuses a name another player holds, ignoring case", async () => {
    const handle = name();
    const first = await submitHandle(handles, user(), handle);
    expect(first.ok).toBe(true);
    expect(await submitHandle(handles, user(), handle.toUpperCase())).toEqual({ ok: false, reason: "taken" });
  });

  it("lets the same player save the same handle again (a retry) and change it, freeing the old name", async () => {
    const owner = user();
    const handle = name();
    const first = await submitHandle(handles, owner, handle);
    const again = await submitHandle(handles, owner, handle);
    expect(again).toEqual(first);
    const next = name();
    await submitHandle(handles, owner, next);
    expect((await readOwnHandle(handles, owner))?.handle).toBe(next);
    expect((await submitHandle(handles, user(), handle)).ok).toBe(true);
  });

  it("refuses text the rules would refuse, in the database too", async () => {
    await expect(submitHandle(handles, user(), "no spaces")).rejects.toThrow();
    await expect(submitHandle(handles, user(), "ab")).rejects.toThrow();
    await expect(submitHandle(handles, user(), "a".repeat(21))).rejects.toThrow();
  });
});

describe("recording a decision", () => {
  it("approves a pending handle, and a decision for a handle the player has changed is dropped", async () => {
    const owner = user();
    const old = name();
    const saved = await submitHandle(handles, owner, old);
    if (!saved.ok) throw new Error("setup");
    const changed = name();
    await submitHandle(handles, owner, changed);

    expect(await recordDecision(handles, { handleId: saved.handleId, handle: old, outcome: "approved", probability: 0.99 })).toBe(false);
    expect((await readOwnHandle(handles, owner))?.status).toBe("pending");
    expect(await recordDecision(handles, { handleId: saved.handleId, handle: changed, outcome: "approved", probability: 0.99 })).toBe(true);
    expect((await readOwnHandle(handles, owner))?.status).toBe("approved");
    // decided once: a second answer does not overwrite it
    expect(await recordDecision(handles, { handleId: saved.handleId, handle: changed, outcome: "review", probability: 0.1, reason: "below-threshold" })).toBe(false);
  });

  it("puts a handle in review with its probability and reason; a person approves or rejects it once", async () => {
    const approved = await submitHandle(handles, user(), name());
    const rejected = await submitHandle(handles, user(), name());
    if (!approved.ok || !rejected.ok) throw new Error("setup");
    const read = async (id: string) => (await listReviewQueue(handles)).find((item) => item.handleId === id);
    const a = (await handles.query<{ handle: string }>("SELECT handle FROM handles.handle WHERE handle_id = $1", [approved.handleId])).rows[0]!.handle;
    const r = (await handles.query<{ handle: string }>("SELECT handle FROM handles.handle WHERE handle_id = $1", [rejected.handleId])).rows[0]!.handle;
    await recordDecision(handles, { handleId: approved.handleId, handle: a, outcome: "review", probability: 0.42, reason: "below-threshold" });
    await recordDecision(handles, { handleId: rejected.handleId, handle: r, outcome: "review", probability: null, reason: "timeout" });

    expect(await read(approved.handleId)).toMatchObject({ handle: a, probability: 0.42, reason: "below-threshold" });
    expect(await read(rejected.handleId)).toMatchObject({ probability: null, reason: "timeout" });

    expect(await resolveReview(handles, approved.handleId, "approve")).toBe(true);
    expect(await resolveReview(handles, rejected.handleId, "reject")).toBe(true);
    expect(await resolveReview(handles, approved.handleId, "reject")).toBe(false); // already decided
    expect(await read(approved.handleId)).toBeUndefined();
    expect(await read(rejected.handleId)).toBeUndefined();
  });

  it("drops the queue entry when the player changes a handle that was in review", async () => {
    const owner = user();
    const handle = name();
    const saved = await submitHandle(handles, owner, handle);
    if (!saved.ok) throw new Error("setup");
    await recordDecision(handles, { handleId: saved.handleId, handle, outcome: "review", probability: 0.5, reason: "no-key" });
    await submitHandle(handles, owner, name());
    expect((await listReviewQueue(handles)).some((item) => item.handleId === saved.handleId)).toBe(false);
  });
});

describe("the boundary between the two owners", () => {
  it("the handles owner cannot read or write the trading schema, and trading cannot read the handle tables", async () => {
    await expect(handles.query("SELECT 1 FROM trading.accounts LIMIT 1")).rejects.toThrow(/permission denied/);
    await expect(handles.query("DELETE FROM trading.accounts")).rejects.toThrow(/permission denied/);
    await expect(trading.query("SELECT 1 FROM handles.handle LIMIT 1")).rejects.toThrow(/permission denied/);
    await expect(trading.query("SELECT 1 FROM handles.review_queue LIMIT 1")).rejects.toThrow(/permission denied/);
    await expect(trading.query("UPDATE handles.handle SET status = 'approved'")).rejects.toThrow(/permission denied/);
    await expect(trading.query("SELECT owner_user_id, handle FROM handles.approved_v1 LIMIT 1")).resolves.toBeDefined();
  });
});

describe("the leaderboard shows an approved handle and nothing else", () => {
  it("shows the neutral label while pending, in review or rejected, and the handle once approved, after a refresh", async () => {
    const owner = user();
    const { accountId } = await ensurePlayerAccount(trading, owner);
    const handle = name();
    const saved = await submitHandle(handles, owner, handle);
    if (!saved.ok) throw new Error("setup");
    const shown = async (): Promise<string | undefined> => {
      await refreshLeaderboard(trading);
      return (await readLeaderboardRows(trading)).find((row) => row.accountId === accountId)?.handle;
    };

    expect(await shown()).toBe(neutralHandle(owner)); // pending
    await recordDecision(handles, { handleId: saved.handleId, handle, outcome: "review", probability: 0.4, reason: "below-threshold" });
    expect(await shown()).toBe(neutralHandle(owner)); // in review
    await resolveReview(handles, saved.handleId, "reject");
    expect(await shown()).toBe(neutralHandle(owner)); // rejected

    const approved = name();
    const next = await submitHandle(handles, owner, approved);
    if (!next.ok) throw new Error("setup");
    await recordDecision(handles, { handleId: next.handleId, handle: approved, outcome: "approved", probability: 0.99 });
    expect(await shown()).toBe(approved);
  });
});
