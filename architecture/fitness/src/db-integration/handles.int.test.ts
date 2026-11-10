import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { CHANGE_LIMIT, STUCK_AFTER_MINUTES, createPool as createHandlesPool, dismissReports, listReported, listReviewQueue, listStuckPending, readOwnHandle, readStuckPending, recordDecision, reportHandle, resolveReview, revokeHandle, submitHandle } from "@bullpen/db-handles";
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

/** A player with an approved handle: saved, then approved by the model's answer. */
async function approvedPlayer(): Promise<{ owner: string; handle: string; handleId: string }> {
  const owner = user();
  const handle = name();
  const saved = await submitHandle(handles, owner, handle);
  if (!saved.ok) throw new Error("setup");
  await recordDecision(handles, { handleId: saved.handleId, handle, outcome: "approved", probability: 0.99 });
  return { owner, handle, handleId: saved.handleId };
}
const reported = async (handleId: string) => (await listReported(handles)).find((item) => item.handleId === handleId);

describe("reporting a handle", () => {
  it("takes one report for each reporter and handle, found by the name as shown, ignoring case", async () => {
    const target = await approvedPlayer();
    const first = user();
    expect(await reportHandle(handles, first, target.handle.toUpperCase())).toEqual({ ok: true });
    expect(await reportHandle(handles, first, target.handle)).toEqual({ ok: false, reason: "already" });
    expect(await reportHandle(handles, user(), target.handle)).toEqual({ ok: true });
    expect(await reported(target.handleId)).toMatchObject({ handle: target.handle, reports: 2 });
    const { rows } = await handles.query("SELECT count(*)::int AS n FROM handles.reports WHERE handle_id = $1", [target.handleId]);
    expect(rows[0].n).toBe(2);
  });

  it("refuses a report of your own handle, and of a handle that is not approved or does not exist", async () => {
    const target = await approvedPlayer();
    expect(await reportHandle(handles, target.owner, target.handle)).toEqual({ ok: false, reason: "own" });
    const pending = name();
    await submitHandle(handles, user(), pending);
    expect(await reportHandle(handles, user(), pending)).toEqual({ ok: false, reason: "not-found" });
    expect(await reportHandle(handles, user(), name())).toEqual({ ok: false, reason: "not-found" });
    expect(await reported(target.handleId)).toBeUndefined();
  });

  it("stores ids and a time, and nothing the reporter typed or anything else about them", async () => {
    const { rows } = await handles.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'handles' AND table_name = 'reports' ORDER BY ordinal_position");
    expect(rows.map((row) => row.column_name)).toEqual(["report_id", "handle_id", "reporter_user_id", "reported_at", "dismissed_at"]);
  });

  it("lists the most reported first, with a count and no reporter", async () => {
    const one = await approvedPlayer();
    const two = await approvedPlayer();
    await reportHandle(handles, user(), one.handle);
    for (let i = 0; i < 3; i++) await reportHandle(handles, user(), two.handle);
    const list = await listReported(handles);
    expect(list.findIndex((item) => item.handleId === two.handleId)).toBeLessThan(list.findIndex((item) => item.handleId === one.handleId));
    expect(Object.keys(list[0]!).sort()).toEqual(["firstReportedAt", "handle", "handleId", "reports"]);
  });

  it("a dismissed report leaves the list, its reporter still cannot report it again, and a new reporter brings it back", async () => {
    const target = await approvedPlayer();
    const reporter = user();
    await reportHandle(handles, reporter, target.handle);
    expect(await dismissReports(handles, target.handleId)).toBe(true);
    expect(await reported(target.handleId)).toBeUndefined();
    expect(await dismissReports(handles, target.handleId)).toBe(false); // nothing open
    expect(await reportHandle(handles, reporter, target.handle)).toEqual({ ok: false, reason: "already" });
    expect(await reportHandle(handles, user(), target.handle)).toEqual({ ok: true });
    expect(await reported(target.handleId)).toMatchObject({ reports: 1 });
  });

  it("a player who changes the handle starts with no reports: a report is about the text", async () => {
    const target = await approvedPlayer();
    await reportHandle(handles, user(), target.handle);
    await submitHandle(handles, target.owner, name());
    const { rows } = await handles.query("SELECT count(*)::int AS n FROM handles.reports WHERE handle_id = $1", [target.handleId]);
    expect(rows[0].n).toBe(0);
    expect(await reported(target.handleId)).toBeUndefined();
  });

  it("saving the same handle again (a retry) keeps its reports", async () => {
    const target = await approvedPlayer();
    await reportHandle(handles, user(), target.handle);
    await submitHandle(handles, target.owner, target.handle);
    const { rows } = await handles.query("SELECT count(*)::int AS n FROM handles.reports WHERE handle_id = $1", [target.handleId]);
    expect(rows[0].n).toBe(1);
  });
});

describe("taking a handle down", () => {
  it("revokes an approved handle: the view stops publishing it, the leaderboard shows the neutral label at the next refresh, and its reports go", async () => {
    const target = await approvedPlayer();
    const { accountId } = await ensurePlayerAccount(trading, target.owner);
    const shown = async (): Promise<string | undefined> => {
      await refreshLeaderboard(trading);
      return (await readLeaderboardRows(trading)).find((row) => row.accountId === accountId)?.handle;
    };
    expect(await shown()).toBe(target.handle);
    await reportHandle(handles, user(), target.handle);

    expect(await revokeHandle(handles, target.handleId)).toBe(true);
    expect((await readOwnHandle(handles, target.owner))?.status).toBe("revoked");
    expect(await shown()).toBe(neutralHandle(target.owner));
    const view = await trading.query("SELECT 1 FROM handles.approved_v1 WHERE owner_user_id = $1", [target.owner]);
    expect(view.rowCount).toBe(0);
    expect(await reported(target.handleId)).toBeUndefined();
    const { rows } = await handles.query("SELECT count(*)::int AS n FROM handles.reports WHERE handle_id = $1", [target.handleId]);
    expect(rows[0].n).toBe(0);
  });

  it("only an approved handle can be revoked, and once", async () => {
    const target = await approvedPlayer();
    expect(await revokeHandle(handles, target.handleId)).toBe(true);
    expect(await revokeHandle(handles, target.handleId)).toBe(false);
    const pending = await submitHandle(handles, user(), name());
    if (!pending.ok) throw new Error("setup");
    expect(await revokeHandle(handles, pending.handleId)).toBe(false);
    expect(await revokeHandle(handles, "00000000-0000-4000-8000-000000000000")).toBe(false);
  });

  it("the player who had it cannot save a revoked handle again, in any case, and it costs them no change; they can choose another", async () => {
    const target = await approvedPlayer();
    await revokeHandle(handles, target.handleId);
    const count = async (): Promise<number> => (await handles.query("SELECT count(*)::int AS n FROM handles.handle_changes WHERE owner_user_id = $1", [target.owner])).rows[0].n;
    const before = await count();
    expect(await submitHandle(handles, target.owner, target.handle)).toEqual({ ok: false, reason: "revoked" });
    expect(await submitHandle(handles, target.owner, target.handle.toUpperCase())).toEqual({ ok: false, reason: "revoked" });
    expect(await count()).toBe(before);
    expect((await readOwnHandle(handles, target.owner))?.status).toBe("revoked"); // nothing was saved over it

    const other = name();
    expect((await submitHandle(handles, target.owner, other)).ok).toBe(true);
    expect((await readOwnHandle(handles, target.owner))?.handle).toBe(other);
    // still refused after they have moved on: the block is on the text
    expect(await submitHandle(handles, target.owner, target.handle)).toEqual({ ok: false, reason: "revoked" });
  });

  it("is blocked for everyone: player B cannot save player A's revoked handle, while A still holds it and after A has moved on, with the same answer both times", async () => {
    const a = await approvedPlayer();
    await revokeHandle(handles, a.handleId);
    const b = user();
    const changes = async (): Promise<number> => (await handles.query("SELECT count(*)::int AS n FROM handles.handle_changes WHERE owner_user_id = $1", [b])).rows[0].n;

    // A's row still holds the text (status revoked, the name unique): B gets 'revoked', not 'taken', so B is not told that anyone holds it
    const held = await submitHandle(handles, b, a.handle);
    expect(held).toEqual({ ok: false, reason: "revoked" });
    expect(await submitHandle(handles, b, a.handle.toUpperCase())).toEqual({ ok: false, reason: "revoked" });
    expect(await readOwnHandle(handles, b)).toBeNull(); // nothing was saved for B
    expect(await changes()).toBe(0); // and nothing was counted

    // A moves on, so the text is free in handles.handle: B is still refused, with the same answer
    await submitHandle(handles, a.owner, name());
    expect(await submitHandle(handles, b, a.handle)).toEqual(held);
    expect(await changes()).toBe(0);

    // B can choose another handle
    expect((await submitHandle(handles, b, name())).ok).toBe(true);
  });

  it("an answer for B that says nothing about A: it carries only the reason, never an id, a time or a handle", async () => {
    const a = await approvedPlayer();
    await revokeHandle(handles, a.handleId);
    const answer = await submitHandle(handles, user(), a.handle);
    expect(answer).toEqual({ ok: false, reason: "revoked" });
    expect(JSON.stringify(answer)).not.toContain(a.owner);
  });

  it("keeps the text and the time of a taken-down handle, and no player", async () => {
    const { rows } = await handles.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'handles' AND table_name = 'revoked' ORDER BY ordinal_position");
    expect(rows.map((row) => row.column_name)).toEqual(["handle_lower", "revoked_at"]);
  });

  it("the new tables belong to the handles owner and trading cannot read them", async () => {
    const owners = await handles.query<{ tablename: string; tableowner: string }>("SELECT tablename, tableowner FROM pg_tables WHERE schemaname = 'handles' ORDER BY tablename");
    expect(owners.rows.every((row) => row.tableowner === "handles_owner")).toBe(true);
    expect(owners.rows.map((row) => row.tablename)).toEqual(expect.arrayContaining(["reports", "revoked", "handle", "review_queue", "handle_changes"]));
    await expect(trading.query("SELECT 1 FROM handles.reports LIMIT 1")).rejects.toThrow(/permission denied/);
    await expect(trading.query("SELECT 1 FROM handles.revoked LIMIT 1")).rejects.toThrow(/permission denied/);
    await expect(trading.query("INSERT INTO handles.reports (handle_id, reporter_user_id) VALUES (gen_random_uuid(), 'x')")).rejects.toThrow(/permission denied/);
  });
});
