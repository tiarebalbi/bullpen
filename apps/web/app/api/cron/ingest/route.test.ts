import { beforeEach, describe, expect, it, vi } from "vitest";

const runStockIngest = vi.fn();
vi.mock("../../../market-data/ingest.js", async () => {
  const actual = await vi.importActual<typeof import("../../../market-data/ingest.js")>("../../../market-data/ingest.js");
  return { ...actual, runStockIngest };
});
vi.mock("../../../market-data/db/pool.js", () => ({ marketDataPool: () => ({}) }));
// The test sets the configuration through the module that owns it, so it never names the variables.
const config = { cronSecret: undefined as string | undefined, providerKey: undefined as string | undefined };
vi.mock("../../../market-data/config.js", () => ({ marketDataConfig: () => config }));

const { GET } = await import("./route.js");

const call = (headers: Record<string, string | undefined> = {}, query = "") => GET(new Request(`http://localhost/api/cron/ingest${query}`, { headers: headers as Record<string, string> }));
const summary = { date: "2026-10-13", skipped: null, stored: ["AAPL"], alreadyHad: [], notYetPublished: [], failed: [], refused: false };

describe("GET /api/cron/ingest", () => {
  beforeEach(() => {
    runStockIngest.mockReset().mockResolvedValue(summary);
    config.cronSecret = "s3cret";
    config.providerKey = "key";
  });

  it("refuses a request without the cron secret, and runs nothing", async () => {
    for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: "s3cret" }]) {
      expect((await call(headers)).status).toBe(401);
    }
    expect(runStockIngest).not.toHaveBeenCalled();
  });

  it("refuses everything when no secret is configured", async () => {
    config.cronSecret = undefined;
    expect((await call({ authorization: "Bearer undefined" })).status).toBe(401);
    expect(runStockIngest).not.toHaveBeenCalled();
  });

  it("runs the ingest for every symbol and returns its summary when the secret is right", async () => {
    const response = await call({ authorization: "Bearer s3cret" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(summary);
    expect(runStockIngest.mock.calls[0]![0].symbols).toHaveLength(10);
  });

  it("runs only the symbols asked for, so a hand-called validation spends one or two calls", async () => {
    await call({ authorization: "Bearer s3cret" }, "?symbols=aapl,MSFT");
    expect(runStockIngest.mock.calls[0]![0].symbols).toEqual(["AAPL", "MSFT"]);
  });

  it("refuses symbols that are not on the list", async () => {
    const response = await call({ authorization: "Bearer s3cret" }, "?symbols=AAPL,ZZZZ");
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Unknown symbols: ZZZZ" });
    expect(runStockIngest).not.toHaveBeenCalled();
  });

  it("says so when the provider key is not configured, instead of calling anyone", async () => {
    config.providerKey = undefined;
    const response = await call({ authorization: "Bearer s3cret" });
    expect(response.status).toBe(500);
    expect(runStockIngest).not.toHaveBeenCalled();
  });
});
