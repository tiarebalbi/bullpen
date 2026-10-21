import { cancelPlayerOrder } from "@bullpen/db-trading";
import { apiError, noStore, resolvePlayer } from "../../../../lib/trading/playerAccount.js";
import { tradingPool } from "../../../../lib/trading/pool.js";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Asks to cancel one of the player's own orders. A request is not a cancel: the order stays open for fills until the venue confirms
 * it (ADR-0017), so the answer says "requested", not "cancelled". Someone else's order is "not found", the same as one that does not exist.
 */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const who = await resolvePlayer();
  if (!who.ok) return who.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return apiError(404, { error: "not-found", message: "I cannot find that order." });
  try {
    const outcome = await cancelPlayerOrder(tradingPool(), who.accountId, id);
    if (outcome === "not-found") return apiError(404, { error: "not-found", message: "I cannot find that order." });
    return Response.json({ outcome }, { status: 202, headers: noStore });
  } catch {
    return apiError(503, { error: "unavailable", message: "I could not ask for that cancel. Try again in a moment." });
  }
}
