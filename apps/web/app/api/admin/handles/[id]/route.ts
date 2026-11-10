import { dismissReports, readStuckPending, recordDecision, resolveReview, revokeHandle, submitHandle, type Decision } from "@bullpen/db-handles";
import { isHandleAdmin } from "../../../../lib/handles/admins.js";
import { handlesPool } from "../../../../lib/handles/pool.js";
import { handleError, logHandleFailure, noStore } from "../../../../lib/handles/respond.js";
import { requirePlayer } from "../../../../lib/handles/session.js";
import { moderateSaved } from "../../../../lib/moderation/moderate.js";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Action = "approve" | "reject" | "retry" | "revoke" | "dismiss";
const ACTIONS: readonly Action[] = ["approve", "reject", "retry", "revoke", "dismiss"];
const isAction = (value: unknown): value is Action => ACTIONS.includes(value as Action);

const ok = (extra: Record<string, unknown> = {}): Response => Response.json({ ok: true, ...extra }, { headers: noStore });
const already = (message: string): Response => handleError(409, { error: "already-decided", message });

/** The handles pool, as the data layer takes it. */
type Pool = Parameters<typeof resolveReview>[0];
type Decide = (pool: Pool, id: string) => Promise<Response>;

const resolve = (action: "approve" | "reject"): Decide => async (pool, id) =>
  (await resolveReview(pool, id, action)) ? ok() : already("That handle is no longer waiting for a decision.");

/** Asks the model again about a handle stuck pending, and records what it says (a failure of any kind puts it in review). Not a change by the player. */
const retry: Decide = async (pool, id) => {
  const stuck = await readStuckPending(pool, id);
  if (!stuck) return already("That handle is no longer stuck: it was decided, changed, or is not old enough yet.");
  const store = { submit: (userId: string, handle: string) => submitHandle(pool, userId, handle), record: (decision: Decision) => recordDecision(pool, decision) };
  return ok({ status: await moderateSaved(stuck.handleId, stuck.handle, { store }) });
};

const revoke: Decide = async (pool, id) => ((await revokeHandle(pool, id)) ? ok() : already("That handle is no longer approved: it was changed or taken down already."));
const dismiss: Decide = async (pool, id) => ((await dismissReports(pool, id)) ? ok() : already("That handle has no open reports."));

const DECIDE: Record<Action, Decide> = { approve: resolve("approve"), reject: resolve("reject"), retry, revoke, dismiss };

/**
 * A reviewer's decision on one handle: approve or reject one in review or stuck pending, revoke an approved one that was reported (it shows as "Player ####" again at the next
 * leaderboard refresh, and its player cannot save it again) or dismiss its reports (it stays), or retry one stuck pending, which asks the model again and records what it says. A
 * retry is not a change by the player and is not counted against their limit. Anyone who is not on the allowlist gets the same 404 as a route that does not exist.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = await requirePlayer();
  if (!who.ok) return who.response;
  if (!isHandleAdmin(who.player.userId)) return handleError(404, { error: "not-found", message: "Not found." });

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const action = typeof body === "object" && body !== null ? (body as { action?: unknown }).action : undefined;
  if (!UUID.test(id) || !isAction(action)) return handleError(400, { error: "invalid-handle", message: "That is not a decision I can record." });

  try {
    return await DECIDE[action](handlesPool(), id);
  } catch (error) {
    logHandleFailure("admin.handles.POST", error);
    return handleError(503, { error: "unavailable", message: "I could not record that. Try again in a moment." });
  }
}
