import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createPool: vi.fn(), attachDatabasePool: vi.fn() }));
vi.mock("@bullpen/db-trading", () => ({ createPool: mocks.createPool }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: mocks.attachDatabasePool }));

const { isPoolerHost, makeTradingPool } = await import("./makePool.js");
const { orderPool, ORDER_POOL } = await import("./orders/pool.js");
const { readPool, READ_POOL } = await import("./reads/pool.js");

const POOLED = "postgres://u:p@ep-cool-123456-pooler.us-east-2.aws.neon.tech/db";
const DIRECT = "postgres://u:p@ep-cool-123456.us-east-2.aws.neon.tech/db";

beforeEach(() => {
  mocks.createPool.mockReset().mockImplementation((_url, options) => ({ options }));
  mocks.attachDatabasePool.mockReset();
  process.env.DATABASE_URL_TRADING = POOLED;
});
afterEach(() => {
  delete process.env.DATABASE_URL_TRADING;
  vi.restoreAllMocks();
});

describe("isPoolerHost", () => {
  it("is true for a Neon pooled host and for a machine's own address, false for a direct host or a bad URL", () => {
    expect(isPoolerHost(POOLED)).toBe(true);
    expect(isPoolerHost("postgres://u:p@localhost:5432/db")).toBe(true);
    expect(isPoolerHost("postgres://u:p@127.0.0.1:5432/db")).toBe(true);
    expect(isPoolerHost(DIRECT)).toBe(false);
    expect(isPoolerHost("not a url")).toBe(false);
  });
});

describe("the two pools", () => {
  it("are distinct, each named, bounded and waiting a bounded time, and each attached to the function's lifecycle", () => {
    const orders = orderPool();
    const reads = readPool();
    expect(orders).not.toBe(reads);
    expect(mocks.createPool).toHaveBeenCalledWith(POOLED, { max: ORDER_POOL.max, applicationName: "bullpen-orders", connectionTimeoutMillis: ORDER_POOL.waitMs, idleTimeoutMillis: 5000 });
    expect(mocks.createPool).toHaveBeenCalledWith(POOLED, { max: READ_POOL.max, applicationName: "bullpen-reads", connectionTimeoutMillis: READ_POOL.waitMs, idleTimeoutMillis: 5000 });
    expect(mocks.attachDatabasePool).toHaveBeenCalledTimes(2);
  });

  it("are made once per module, not once per request", () => {
    expect(orderPool()).toBe(orderPool());
    expect(readPool()).toBe(readPool());
  });

  it("keep the order pool the larger and the read wait the shorter: reads are refused sooner than orders", () => {
    expect(ORDER_POOL.max).toBeGreaterThan(READ_POOL.max);
    expect(READ_POOL.waitMs).toBeLessThan(ORDER_POOL.waitMs);
  });
});

describe("makeTradingPool", () => {
  it("refuses to start without the URL", () => {
    delete process.env.DATABASE_URL_TRADING;
    expect(() => makeTradingPool({ name: "x", max: 1, waitMs: 1 })).toThrow("DATABASE_URL_TRADING is not set");
  });
});
