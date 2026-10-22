import { randomUUID } from "node:crypto";
import type pg from "pg";
import { expect } from "vitest";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { checkEquityInvariant, checkOrderInvariants, createPool as createTradingPool, refreshLeaderboard, type AccountStart } from "@bullpen/db-trading";
import type { DbUrls } from "./global-setup.js";
import { formatViolation } from "../violation.js";
import { checkLeaderboardReconciliation } from "./reconcile-check.js";

/** A test's own accounts, prices and pools. Nothing here touches a deployed database; every row is a test row. */
export function world(urls: DbUrls, poolSize = 12) {
  const trading = createTradingPool(urls.tradingOwner, poolSize);
  const marketData = createMarketDataPool(urls.marketDataOwner);
  const accounts: AccountStart[] = [];

  return {
    trading,
    marketData,
    accounts,
    symbol: (): string => `P${randomUUID().slice(0, 7).toUpperCase()}`,

    async account(buyingPower: string): Promise<string> {
      const { rows } = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, $2) RETURNING account_id", [`zz-test-${randomUUID()}`, buyingPower]);
      accounts.push({ accountId: rows[0]!.account_id, startingCash: buyingPower });
      return rows[0]!.account_id;
    },

    /** A quote that is `ageMs` old and valid for an hour from now, or already past `valid_until` when `stale`. `kind: "end-of-day"` makes it a close, as the stock ingest stores. */
    async price(symbol: string, value: string, options: { ageMs?: number; stale?: boolean; kind?: "live" | "end-of-day" } = {}): Promise<void> {
      await marketData.query(
        `INSERT INTO market_data.quotes (symbol, as_of, price, source, valid_until, kind)
         VALUES ($1, now() - make_interval(secs => $3::numeric / 1000), $2, 'test', now() ${options.stale ? "- interval '1 second'" : "+ interval '1 hour'"}, $4)`,
        [symbol, value, options.ageMs ?? 1000, options.kind ?? "live"],
      );
    },

    /**
     * A stock close as the ingest stores it: as of 16:00 New York, so by the time anyone trades it is hours old. `ageHours` old and valid for four more hours (the close of
     * the latest completed trading day, still current), or `staleClose` for a close older than the latest completed trading day, which the contract flags stale.
     */
    async endOfDayPrice(symbol: string, value: string, options: { ageHours?: number; staleClose?: boolean } = {}): Promise<void> {
      await this.price(symbol, value, { ageMs: (options.ageHours ?? 20) * 3_600_000, kind: "end-of-day", stale: options.staleClose ?? false });
    },

    async order(orderId: string): Promise<Record<string, string | number | null>> {
      const { rows } = await trading.query(
        "SELECT status, version, quantity::text, filled_qty::text, open_qty::text, cancelled_qty::text, needs_attention FROM trading.orders WHERE order_id = $1",
        [orderId],
      );
      return rows[0];
    },
    async reservation(orderId: string): Promise<{ reserved: string; spent: string; released: string; released_at: Date | null; release_failures: number }> {
      const { rows } = await trading.query("SELECT reserved::text, spent::text, released::text, released_at, release_failures FROM trading.reservations WHERE order_id = $1", [orderId]);
      return rows[0];
    },
    async buyingPower(accountId: string): Promise<string> {
      return (await trading.query<{ b: string }>("SELECT buying_power::text AS b FROM trading.accounts WHERE account_id = $1", [accountId])).rows[0]!.b;
    },
    async count(table: "ledger" | "fills" | "order_events", orderId: string): Promise<number> {
      return Number((await trading.query<{ n: string }>(`SELECT count(*) AS n FROM trading.${table} WHERE order_id = $1`, [orderId])).rows[0]!.n);
    },
    async position(accountId: string, symbol: string): Promise<string> {
      return (await trading.query<{ q: string }>("SELECT COALESCE(sum(quantity), 0)::text AS q FROM trading.positions WHERE account_id = $1 AND symbol = $2", [accountId, symbol])).rows[0]!.q;
    },

    /** The invariants of ADR-0017 and the Part 3 reconciliation check, for every account the test made. Run after every test. */
    async assertInvariants(): Promise<void> {
      expect(await checkOrderInvariants(trading, accounts)).toEqual([]);
      expect(await checkEquityInvariant(trading, accounts)).toEqual([]);
      await refreshLeaderboard(trading);
      const violations = await checkLeaderboardReconciliation(trading);
      expect(violations.map(formatViolation)).toEqual([]);
    },

    async close(): Promise<void> {
      await trading.end();
      await marketData.end();
    },
  };
}
export type World = ReturnType<typeof world>;
export type Pool = pg.Pool;
