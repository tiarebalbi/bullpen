import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, inject, it } from "vitest";
import { createPool, reserveProviderCall } from "@bullpen/db-market-data";

const urls = inject("dbUrls");
const pool = createPool(urls.marketDataOwner, 20);
afterAll(() => pool.end());

const provider = (): string => `p-${randomUUID()}`;
const ledger = async (name: string, window: string) => (await pool.query<{ calls: number; refused: number }>("SELECT calls, refused FROM market_data.provider_calls WHERE provider = $1 AND window_key = $2", [name, window])).rows[0];

describe("the call ledger", () => {
  it("holds the cap under concurrent callers: 60 callers, a cap of 20, exactly 20 granted and no double spend", async () => {
    const name = provider();
    const results = await Promise.all(Array.from({ length: 60 }, () => reserveProviderCall(pool, name, "2026-10-13", 20)));

    expect(results.filter((r) => r.granted)).toHaveLength(20);
    expect(results.filter((r) => !r.granted)).toHaveLength(40);
    expect(await ledger(name, "2026-10-13")).toEqual({ calls: 20, refused: 40 });
    // Each granted call got its own count: 1..20, none twice.
    expect(results.filter((r) => r.granted).map((r) => r.calls).sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
  });

  it("counts a refused call as a refusal and never as a call", async () => {
    const name = provider();
    await reserveProviderCall(pool, name, "d", 1);
    const refused = await reserveProviderCall(pool, name, "d", 1);
    expect(refused).toEqual({ granted: false, calls: 1, cap: 1 });
    expect(await ledger(name, "d")).toEqual({ calls: 1, refused: 1 });
  });

  it("rolls the day over: a new provider-day starts again from zero while the old one stays full", async () => {
    const name = provider();
    for (let i = 0; i < 20; i += 1) await reserveProviderCall(pool, name, "2026-10-13", 20);
    expect((await reserveProviderCall(pool, name, "2026-10-13", 20)).granted).toBe(false);

    const next = await reserveProviderCall(pool, name, "2026-10-14", 20);
    expect(next).toEqual({ granted: true, calls: 1, cap: 20 });
    expect((await ledger(name, "2026-10-13"))!.calls).toBe(20);
  });

  it("keeps providers apart", async () => {
    const [a, b] = [provider(), provider()];
    await reserveProviderCall(pool, a, "d", 1);
    expect((await reserveProviderCall(pool, b, "d", 1)).granted).toBe(true);
  });

  it("grants nothing under a cap below one", async () => {
    expect(await reserveProviderCall(pool, provider(), "d", 0)).toEqual({ granted: false, calls: 0, cap: 0 });
  });
});
