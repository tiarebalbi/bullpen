import { BuyRefused, advanceAccount, placePlayerOrder, readAccountView } from "@bullpen/db-trading";
import { validateOrderRequest, type AccountView, type OrderRequest } from "@bullpen/contracts";
import { apiError, noStore, resolvePlayer } from "../../lib/trading/playerAccount.js";
import { tradingPool } from "../../lib/trading/pool.js";

export const dynamic = "force-dynamic";

/**
 * The player's account and orders, for the screens to poll. Each poll first moves the player's own orders along (ADR-0018: the player's requests
 * move a healthy order, the sweeper finds what they did not finish), then reads the account as it stands.
 */
export async function GET(): Promise<Response> {
  const who = await resolvePlayer();
  if (!who.ok) return who.response;
  try {
    const pool = tradingPool();
    await advanceAccount(pool, who.accountId);
    const view = await readAccountView(pool, who.accountId);
    if (!view) return apiError(404, { error: "not-found", message: "I cannot find your account." });
    return Response.json(view satisfies AccountView, { headers: noStore });
  } catch {
    return apiError(503, { error: "unavailable", message: "I cannot reach your account right now. Try again in a moment." });
  }
}

/** A market buy. The client's key makes a retry return the same order, so a double click or a lost response places one order. */
export async function POST(request: Request): Promise<Response> {
  const who = await resolvePlayer();
  if (!who.ok) return who.response;

  const body: unknown = await request.json().catch(() => null);
  const checked = validateOrderRequest(body);
  if (!checked.valid) return apiError(400, { error: "invalid-request", message: "That order is not valid: a symbol, a positive quantity and a key are needed, and only market buys exist.", reason: checked.errors?.split("\n")[0] });
  const order = body as OrderRequest;

  try {
    const pool = tradingPool();
    const placed = await placePlayerOrder(pool, who.accountId, order);
    const account = await readAccountView(pool, who.accountId);
    return Response.json({ orderId: placed.orderId, duplicate: placed.duplicate, account }, { status: placed.duplicate ? 200 : 201, headers: noStore });
  } catch (error) {
    if (error instanceof BuyRefused) return apiError(422, { error: "refused", reason: error.reason, message: error.message });
    return apiError(503, { error: "unavailable", message: "I could not place that order. Nothing was reserved; try again in a moment." });
  }
}
