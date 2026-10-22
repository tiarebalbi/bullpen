import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ checkSchema: vi.fn() }));
vi.mock("@bullpen/db-trading", () => ({ OWNER_ROLE: "trading_owner", checkSchema: db.checkSchema }));
vi.mock("./pool.js", () => ({ tradingPool: () => ({}) }));

const { tradingChecks, tradingConfigIssues, tradingDatabaseIssues } = await import("./health.js");

const GOOD = { DATABASE_URL_TRADING: "postgresql://trading_owner:pw@db.example.test/neondb?sslmode=require", SWEEP_SECRET: "s".repeat(32) };

beforeEach(() => {
  db.checkSchema.mockReset();
});

describe("tradingConfigIssues", () => {
  it("finds nothing wrong with a usable pair", () => {
    expect(tradingConfigIssues(GOOD)).toEqual([]);
  });

  it("names each missing variable", () => {
    expect(tradingConfigIssues({})).toEqual(["DATABASE_URL_TRADING is not set", "SWEEP_SECRET is not set"]);
  });

  it("names a URL that is not postgres, not a URL, or for the wrong role", () => {
    expect(tradingConfigIssues({ ...GOOD, DATABASE_URL_TRADING: "https://db.example.test" })).toEqual(["DATABASE_URL_TRADING is not a postgres URL"]);
    expect(tradingConfigIssues({ ...GOOD, DATABASE_URL_TRADING: "not a url" })).toEqual(["DATABASE_URL_TRADING is not a URL"]);
    expect(tradingConfigIssues({ ...GOOD, DATABASE_URL_TRADING: "postgresql://market_data_owner:pw@db.example.test/neondb" })).toEqual(["DATABASE_URL_TRADING does not connect as trading_owner"]);
  });

  it("names a short sweep secret", () => {
    expect(tradingConfigIssues({ ...GOOD, SWEEP_SECRET: "short" })).toEqual(["SWEEP_SECRET is shorter than 16 characters"]);
  });

  it("never repeats a value", () => {
    const issues = tradingConfigIssues({ DATABASE_URL_TRADING: "postgresql://wrong-user:hunter2@secret-host.example.test/db", SWEEP_SECRET: "tiny-value" });
    expect(JSON.stringify(issues)).not.toMatch(/hunter2|secret-host|wrong-user|tiny-value/);
  });
});

describe("tradingDatabaseIssues", () => {
  it("is empty when the schema is complete", async () => {
    db.checkSchema.mockResolvedValue([]);
    expect(await tradingDatabaseIssues()).toEqual([]);
  });

  it("names what is missing and says to run the migrations", async () => {
    db.checkSchema.mockResolvedValue(["trading.accounts.owner_user_id"]);
    expect(await tradingDatabaseIssues()).toEqual(["trading.accounts.owner_user_id is missing: run the migrations"]);
  });

  it("reports an unreachable database by the error's code, not its text", async () => {
    db.checkSchema.mockImplementation(() => Promise.reject(Object.assign(new Error("connect ECONNREFUSED 10.0.0.7:5432"), { code: "ECONNREFUSED" })));
    const issues = await tradingDatabaseIssues();
    expect(issues).toEqual(["the trading database cannot be queried (ECONNREFUSED)"]);
    expect(issues[0]).not.toContain("10.0.0.7");
  });

  it("reports a missing pool variable, which makes the pool throw before any query", async () => {
    expect(await tradingDatabaseIssues(() => { throw new Error("DATABASE_URL_TRADING is not set"); })).toEqual(["the trading database cannot be queried (Error)"]);
  });
});

describe("tradingChecks", () => {
  const stub = (env: Record<string, string>) => { for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v); };
  beforeEach(() => { vi.unstubAllEnvs(); vi.stubEnv("DATABASE_URL_TRADING", ""); vi.stubEnv("SWEEP_SECRET", ""); });

  it("passes both checks for a usable configuration and a complete schema", async () => {
    stub(GOOD);
    db.checkSchema.mockResolvedValue([]);
    expect(await tradingChecks()).toEqual([{ name: "trading-config", ok: true, problems: [] }, { name: "trading-database", ok: true, problems: [] }]);
  });

  it("does not try the database when its URL is not usable", async () => {
    stub({ SWEEP_SECRET: GOOD.SWEEP_SECRET });
    const checks = await tradingChecks();
    expect(db.checkSchema).not.toHaveBeenCalled();
    expect(checks[0]).toMatchObject({ name: "trading-config", ok: false, problems: ["DATABASE_URL_TRADING is not set"] });
    expect(checks[1]).toEqual({ name: "trading-database", ok: false, problems: ["not tried: the database URL is not usable"] });
  });

  it("still tries the database when only the sweep secret is wrong", async () => {
    stub({ DATABASE_URL_TRADING: GOOD.DATABASE_URL_TRADING });
    db.checkSchema.mockResolvedValue([]);
    const checks = await tradingChecks();
    expect(checks[0]!.ok).toBe(false);
    expect(checks[1]).toEqual({ name: "trading-database", ok: true, problems: [] });
  });
});
