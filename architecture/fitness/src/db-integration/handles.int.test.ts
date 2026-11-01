import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { CHANGE_LIMIT, STUCK_AFTER_MINUTES, createPool as createHandlesPool, listReviewQueue, listStuckPending, readOwnHandle, readStuckPending, recordDecision, resolveReview, submitHandle } from "@bullpen/db-handles";
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

describe("the limit on changes", () => {
  it("allows five saves in 24 hours and refuses the sixth, changing and counting nothing", async () => {
    expect(CHANGE_LIMIT).toBe(5);
    const owner = user();
    let last = "";
    for (let i = 0; i < CHANGE_LIMIT; i++) {
      last = name();
      expect((await submitHandle(handles, owner, last)).ok).toBe(true);
    }
    const refused = await submitHandle(handles, owner, name());
    expect(refused).toMatchObject({ ok: false, reason: "limit" });
    expect(refused.ok === false && refused.reason === "limit" && refused.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused.ok === false && refused.reason === "limit" && refused.retryAfterSeconds).toBeLessThanOrEqual(24 * 3600);
    // the player keeps the handle they had, and the refusal left no trace
    expect((await readOwnHandle(handles, owner))?.handle).toBe(last);
    const { rows } = await handles.query<{ n: string }>("SELECT count(*)::text AS n FROM handles.handle_changes WHERE owner_user_id = $1", [owner]);
    expect(rows[0]!.n).toBe("5");
  });

  it("is per player: one player's limit does not touch another's", async () => {
    const busy = user();
    for (let i = 0; i < CHANGE_LIMIT; i++) await submitHandle(handles, busy, name());
    expect((await submitHandle(handles, busy, name())).ok).toBe(false);
    expect((await submitHandle(handles, user(), name())).ok).toBe(true);
  });

  it("counts a retry of the same handle as a change, and frees a change when it is more than 24 hours old", async () => {
    const owner = user();
    const handle = name();
    for (let i = 0; i < CHANGE_LIMIT; i++) await submitHandle(handles, owner, handle);
    expect(await submitHandle(handles, owner, handle)).toMatchObject({ ok: false, reason: "limit" });
    await handles.query("UPDATE handles.handle_changes SET changed_at = now() - interval '25 hours' WHERE change_id = (SELECT min(change_id) FROM handles.handle_changes WHERE owner_user_id = $1)", [owner]);
    expect((await submitHandle(handles, owner, handle)).ok).toBe(true);
    expect(await submitHandle(handles, owner, handle)).toMatchObject({ ok: false, reason: "limit" });
  });

  it("holds when saves race: ten at once from one player let exactly five through", async () => {
    const owner = user();
    const results = await Promise.all(Array.from({ length: 10 }, () => submitHandle(handles, owner, name())));
    expect(results.filter((r) => r.ok)).toHaveLength(CHANGE_LIMIT);
  });

  it("does not count a save that was refused because the name is taken", async () => {
    const taken = name();
    await submitHandle(handles, user(), taken);
    const owner = user();
    expect(await submitHandle(handles, owner, taken)).toEqual({ ok: false, reason: "taken" });
    const { rows } = await handles.query<{ n: string }>("SELECT count(*)::text AS n FROM handles.handle_changes WHERE owner_user_id = $1", [owner]);
    expect(rows[0]!.n).toBe("0");
  });
});

describe("saving is one transaction", () => {
  it("leaves the old handle, its status and its queue entry exactly as they were when the new name is taken", async () => {
    const owner = user();
    const original = name();
    const saved = await submitHandle(handles, owner, original);
    if (!saved.ok) throw new Error("setup");
    await recordDecision(handles, { handleId: saved.handleId, handle: original, outcome: "review", probability: 0.4, reason: "below-threshold" });
    const taken = name();
    await submitHandle(handles, user(), taken);

    expect(await submitHandle(handles, owner, taken)).toEqual({ ok: false, reason: "taken" });

    expect(await readOwnHandle(handles, owner)).toMatchObject({ handle: original, status: "review" });
    expect((await listReviewQueue(handles)).some((item) => item.handleId === saved.handleId)).toBe(true);
    const { rows } = await handles.query<{ n: string }>("SELECT count(*)::text AS n FROM handles.handle_changes WHERE owner_user_id = $1", [owner]);
    expect(rows[0]!.n).toBe("1"); // the first save only
  });

  it("makes the new handle pending, drops the queue entry and counts the change together", async () => {
    const owner = user();
    const saved = await submitHandle(handles, owner, name());
    if (!saved.ok) throw new Error("setup");
    const first = (await handles.query<{ handle: string }>("SELECT handle FROM handles.handle WHERE handle_id = $1", [saved.handleId])).rows[0]!.handle;
    await recordDecision(handles, { handleId: saved.handleId, handle: first, outcome: "review", probability: 0.4, reason: "no-key" });
    expect((await submitHandle(handles, owner, name())).ok).toBe(true);
    expect((await readOwnHandle(handles, owner))?.status).toBe("pending");
    expect((await listReviewQueue(handles)).some((item) => item.handleId === saved.handleId)).toBe(false);
    const { rows } = await handles.query<{ n: string }>("SELECT count(*)::text AS n FROM handles.handle_changes WHERE owner_user_id = $1", [owner]);
    expect(rows[0]!.n).toBe("2");
  });
});

describe("handles stuck pending", () => {
  const age = (handleId: string, minutes: number) => handles.query("UPDATE handles.handle SET submitted_at = now() - make_interval(mins => $2) WHERE handle_id = $1", [handleId, minutes]);
  const stuckIds = async () => (await listStuckPending(handles, 500)).map((item) => item.handleId);

  it("lists a handle pending for more than 10 minutes, and not one that is newer", async () => {
    expect(STUCK_AFTER_MINUTES).toBe(10);
    const old = await submitHandle(handles, user(), name());
    const fresh = await submitHandle(handles, user(), name());
    if (!old.ok || !fresh.ok) throw new Error("setup");
    await age(old.handleId, 11);
    await age(fresh.handleId, 5);
    const ids = await stuckIds();
    expect(ids).toContain(old.handleId);
    expect(ids).not.toContain(fresh.handleId);
    expect(await readStuckPending(handles, old.handleId)).toMatchObject({ handleId: old.handleId });
    expect(await readStuckPending(handles, fresh.handleId)).toBeNull();
  });

  it("does not list a handle that has been decided, or one in review", async () => {
    const decided = await submitHandle(handles, user(), name());
    if (!decided.ok) throw new Error("setup");
    const text = (await handles.query<{ handle: string }>("SELECT handle FROM handles.handle WHERE handle_id = $1", [decided.handleId])).rows[0]!.handle;
    await age(decided.handleId, 30);
    await recordDecision(handles, { handleId: decided.handleId, handle: text, outcome: "approved", probability: 0.99 });
    expect(await stuckIds()).not.toContain(decided.handleId);
    expect(await readStuckPending(handles, decided.handleId)).toBeNull();
  });

  it("lets a person approve or reject it, once, and not before it is stuck", async () => {
    const approved = await submitHandle(handles, user(), name());
    const rejected = await submitHandle(handles, user(), name());
    const young = await submitHandle(handles, user(), name());
    if (!approved.ok || !rejected.ok || !young.ok) throw new Error("setup");
    await age(approved.handleId, 12);
    await age(rejected.handleId, 12);
    expect(await resolveReview(handles, young.handleId, "approve")).toBe(false); // the answer may still arrive
    expect(await resolveReview(handles, approved.handleId, "approve")).toBe(true);
    expect(await resolveReview(handles, rejected.handleId, "reject")).toBe(true);
    expect(await resolveReview(handles, approved.handleId, "reject")).toBe(false);
    const status = async (id: string) => (await handles.query<{ status: string }>("SELECT status FROM handles.handle WHERE handle_id = $1", [id])).rows[0]!.status;
    expect([await status(approved.handleId), await status(rejected.handleId), await status(young.handleId)]).toEqual(["approved", "rejected", "pending"]);
    expect(await stuckIds()).not.toContain(approved.handleId);
  });

  it("lets a retry record the model's verdict on a stuck handle, and drops it if the player changed the handle meanwhile", async () => {
    const owner = user();
    const first = name();
    const saved = await submitHandle(handles, owner, first);
    if (!saved.ok) throw new Error("setup");
    await age(saved.handleId, 15);
    const stuck = await readStuckPending(handles, saved.handleId);
    expect(stuck?.handle).toBe(first);
    const changed = name();
    await submitHandle(handles, owner, changed); // the player acts while the retry is in flight
    expect(await recordDecision(handles, { handleId: saved.handleId, handle: first, outcome: "approved", probability: 0.99 })).toBe(false);
    expect((await readOwnHandle(handles, owner))?.status).toBe("pending");
    expect(await readStuckPending(handles, saved.handleId)).toBeNull(); // saving again made it fresh
  });
});
