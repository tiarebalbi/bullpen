import { authConfigIssues } from "../../lib/auth/health.js";
import { tradingChecks } from "../../lib/trading/health.js";
import { noStore } from "../../lib/trading/playerAccount.js";

export const dynamic = "force-dynamic";

/**
 * Whether the app can do its job: its variables are set and well formed, and the trading database answers and has every table and column.
 * Answers 200 when everything is fine and 503 when anything is not, so an uptime monitor needs no parsing. It is public, so a problem is
 * a sentence naming a variable or a table, never a value, a host name or an error's own text.
 */
export async function GET(): Promise<Response> {
  const auth = authConfigIssues();
  const checks = [...(await tradingChecks()), { name: "auth-config", ok: auth.length === 0, problems: auth }];
  const ok = checks.every((entry) => entry.ok);
  return Response.json({ status: ok ? "ok" : "unhealthy", checks }, { status: ok ? 200 : 503, headers: noStore });
}
