import type { Pool } from "pg";
import { computeLeaderboardOnRead, readLeaderboardRows, type LeaderboardRow } from "@bullpen/db-trading";
import type { Violation } from "../violation.js";

const CHECK = "leaderboard reconciliation";

/** Recorded in ADR-0014 (the ADL has no line for it: it is about the view matching its source). */
export const RECONCILIATION_RULE = "the leaderboard view equals the ranking computed on read from the source tables";

const describe = (row: LeaderboardRow): string => `rank ${row.rank}, equity ${row.equity} (cash ${row.cash}, positions ${row.positionsValue})`;

/**
 * Compares the leaderboard view with the same ranking computed from the source
 * tables, account by account, and fails with the account and both values. A
 * view that was refreshed before the latest fill or price fails here, and so
 * does a view whose definition has drifted from the on-read query.
 */
export async function checkLeaderboardReconciliation(pool: Pool, relation = "trading.leaderboard_mv"): Promise<Violation[]> {
  const [view, computed] = [await readLeaderboardRows(pool, relation), await computeLeaderboardOnRead(pool)];
  const inView = new Map(view.map((row) => [row.accountId, row]));
  const violations: Violation[] = [];

  for (const expected of computed) {
    const actual = inView.get(expected.accountId);
    inView.delete(expected.accountId);
    const same = actual && actual.rank === expected.rank && actual.cash === expected.cash && actual.positionsValue === expected.positionsValue && actual.equity === expected.equity;
    if (same) continue;
    violations.push({
      check: CHECK,
      rule: RECONCILIATION_RULE,
      where: relation,
      why: `Account "${expected.handle}" (${expected.accountId}) is ${actual ? `${describe(actual)} in the view` : "missing from the view"}, but ${describe(expected)} computed from the source tables (ADR-0014).`,
      fix: actual ? `Refresh the view after the last fill or price, or correct the view's definition so it matches the on-read query.` : `Refresh the view: the account was created after its last refresh.`,
    });
  }
  for (const extra of inView.values()) {
    violations.push({
      check: CHECK,
      rule: RECONCILIATION_RULE,
      where: relation,
      why: `Account "${extra.handle}" (${extra.accountId}) is in the view (${describe(extra)}) but has no row computed from the source tables (ADR-0014).`,
      fix: `Refresh the view, or remove the row that does not come from the source tables.`,
    });
  }
  return violations;
}
