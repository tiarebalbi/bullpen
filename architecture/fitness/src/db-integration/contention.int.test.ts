import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool as createMarketDataPool } from "@bullpen/db-market-data";
import { TEST_HANDLE_PREFIX, createPool as createTradingPool } from "@bullpen/db-trading";
import { runContention } from "../measure/contention.js";

const urls = inject("dbUrls");
const trading = createTradingPool(urls.tradingOwner, 2);
const marketData = createMarketDataPool(urls.marketDataOwner);
afterAll(async () => {
  await trading.end();
  await marketData.end();
});

describe("the contention run", () => {
  it("seeds test-marked rows once, runs every cell, meters the bytes, and removes exactly its own rows", async () => {
    const lines: string[] = [];
    const bystander = await trading.query<{ account_id: string }>("INSERT INTO trading.accounts (handle, buying_power) VALUES ($1, 5) RETURNING account_id", [`${TEST_HANDLE_PREFIX}someone-elses-${Date.now()}`]);

    const report = await runContention({ tradingUrl: urls.tradingOwner, marketDataUrl: urls.marketDataOwner, accounts: 12, seconds: 1, writers: 2, readerCounts: [0, 2], readsPerSecondPerReader: 10, log: (line) => lines.push(line) });

    // one baseline, then both read paths for 2 readers
    expect(report.cells.map((c) => [c.readers, c.path])).toEqual([[0, "none (baseline)"], [2, "computed on read"], [2, "materialized view"]]);
    expect(report.accounts).toBe(12);
    expect(report.positions).toBe(60);
    for (const cell of report.cells) {
      expect(cell.writes.n).toBeGreaterThan(0);
      expect(cell.measuredBytes).toBeGreaterThan(0);
      expect(cell.estimated.bytes).toBeGreaterThan(0);
    }
    for (const cell of report.cells.filter((c) => c.readers > 0)) {
      expect(cell.reads.n).toBeGreaterThan(0);
      expect(cell.bytesPerRead).toBeGreaterThan(0);
    }
    expect(report.totalBytes).toBeGreaterThan(report.setupBytes);

    // cleaned up once: this run's accounts, orders, ledger and quotes are gone; another run's test row is not
    expect(report.removed.accounts).toBe(12);
    expect(report.removed.quotes).toBe(5);
    const left = await trading.query("SELECT 1 FROM trading.accounts WHERE handle LIKE $1", [`${TEST_HANDLE_PREFIX}contention-${report.runId}-%`]);
    expect(left.rowCount).toBe(0);
    const orphans = await trading.query("SELECT 1 FROM trading.orders o LEFT JOIN trading.accounts a USING (account_id) WHERE a.account_id IS NULL");
    expect(orphans.rowCount).toBe(0);
    const quotes = await marketData.query("SELECT 1 FROM market_data.quotes WHERE symbol LIKE $1", [`ZZ${report.runId.slice(0, 4).toUpperCase()}%`]);
    expect(quotes.rowCount).toBe(0);
    expect((await trading.query("SELECT 1 FROM trading.accounts WHERE account_id = $1", [bystander.rows[0]!.account_id])).rowCount).toBe(1);
    expect(lines.some((l) => l.startsWith("seeded 12 accounts"))).toBe(true);
  });
});
