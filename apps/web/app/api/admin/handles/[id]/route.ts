import { resolveReview } from "@bullpen/db-handles";
import { isHandleAdmin } from "../../../../lib/handles/admins.js";
import { handlesPool } from "../../../../lib/handles/pool.js";
import { handleError, logHandleFailure, noStore } from "../../../../lib/handles/respond.js";
import { requirePlayer } from "../../../../lib/handles/session.js";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A reviewer's decision on one handle in review. Anyone who is not on the allowlist gets the same 404 as a route that does not exist. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = await requirePlayer();
  if (!who.ok) return who.response;
  if (!isHandleAdmin(who.player.userId)) return handleError(404, { error: "not-found", message: "Not found." });

  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  const action = typeof body === "object" && body !== null ? (body as { action?: unknown }).action : undefined;
  if (!UUID.test(id) || (action !== "approve" && action !== "reject")) return handleError(400, { error: "invalid-handle", message: "That is not a decision I can record." });

  try {
    if (!(await resolveReview(handlesPool(), id, action))) return handleError(409, { error: "already-decided", message: "That handle is no longer waiting for review." });
    return Response.json({ ok: true }, { headers: noStore });
  } catch (error) {
    logHandleFailure("admin.handles.POST", error);
    return handleError(503, { error: "unavailable", message: "I could not record that. Try again in a moment." });
  }
}
