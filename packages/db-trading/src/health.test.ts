import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { EXPECTED_COLUMNS, EXPECTED_RELATIONS, checkSchema } from "./health.js";

type Answer = { rows: Record<string, string>[] } | Error;
function poolOf(answers: { relations?: string[]; columns?: string[]; prices?: boolean | Error }): Pool {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("pg_class")) return { rows: (answers.relations ?? [...EXPECTED_RELATIONS]).map((relname) => ({ relname })) };
    if (sql.includes("information_schema")) return { rows: (answers.columns ?? EXPECTED_COLUMNS.map(([t, c]) => `${t}.${c}`)).map((v) => ({ table_name: v.split(".")[0]!, column_name: v.split(".")[1]! })) };
    if (answers.prices instanceof Error) throw answers.prices;
    return { rows: [] } satisfies Answer;
  });
  return { query } as unknown as Pool;
}

describe("checkSchema", () => {
  it("finds nothing missing in a complete schema", async () => {
    expect(await checkSchema(poolOf({}))).toEqual([]);
  });

  it("names a column a later migration adds: the one that made every sign-in fail", async () => {
    expect(await checkSchema(poolOf({ columns: ["accounts.handle"] }))).toEqual(["trading.accounts.owner_user_id"]);
  });

  it("names a missing table, and does not also report its columns", async () => {
    const relations = EXPECTED_RELATIONS.filter((name) => name !== "accounts");
    expect(await checkSchema(poolOf({ relations, columns: [] }))).toEqual(["trading.accounts"]);
  });

  it("names the price view when it cannot be read", async () => {
    expect(await checkSchema(poolOf({ prices: new Error("permission denied for view prices_v1") }))).toEqual(["market_data.prices_v1"]);
  });

  it("lets a database that cannot be reached throw, for the caller to report", async () => {
    const pool = { query: vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED")) } as unknown as Pool;
    await expect(checkSchema(pool)).rejects.toThrow("ECONNREFUSED");
  });
});
