import { describe, expect, it, vi } from "vitest";
import { handleIngestRequest } from "./cron.js";

const summary = { date: "2026-10-13", skipped: null, stored: ["AAPL"], alreadyHad: [], notYetPublished: [], failed: [], refused: false };
const call = (headers: Record<string, string | undefined> = {}, query = "", config = { cronSecret: "s3cret" as string | undefined, stockProviderKey: "key" as string | undefined }) => {
  const runIngest = vi.fn().mockResolvedValue(summary);
  const response = handleIngestRequest(new Request(`http://localhost/api/cron/ingest${query}`, { headers: headers as Record<string, string> }), { config, runIngest });
  return { response, runIngest };
};
const bearer = { authorization: "Bearer s3cret" };

describe("handleIngestRequest", () => {
  it("refuses a request without the cron secret, and runs nothing", async () => {
    for (const headers of [{}, { authorization: "Bearer wrong" }, { authorization: "s3cret" }]) {
      const { response, runIngest } = call(headers);
      expect((await response).status).toBe(401);
      expect(runIngest).not.toHaveBeenCalled();
    }
  });

  it("refuses everything when no secret is configured", async () => {
    const { response, runIngest } = call({ authorization: "Bearer undefined" }, "", { cronSecret: undefined, stockProviderKey: "key" });
    expect((await response).status).toBe(401);
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("runs the ingest for every symbol and returns its summary when the secret is right", async () => {
    const { response, runIngest } = call(bearer);
    const result = await response;
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual(summary);
    expect(runIngest.mock.calls[0]![0]).toHaveLength(10);
  });

  it("runs only the symbols asked for, so a hand-called validation spends one or two calls", async () => {
    const { response, runIngest } = call(bearer, "?symbols=aapl,MSFT");
    await response;
    expect(runIngest.mock.calls[0]![0]).toEqual(["AAPL", "MSFT"]);
  });

  it("refuses symbols that are not on the list", async () => {
    const { response, runIngest } = call(bearer, "?symbols=AAPL,ZZZZ");
    const result = await response;
    expect(result.status).toBe(400);
    expect(await result.json()).toEqual({ error: "Unknown symbols: ZZZZ" });
    expect(runIngest).not.toHaveBeenCalled();
  });

  it("says so when the provider key is not configured, instead of calling anyone", async () => {
    const { response, runIngest } = call(bearer, "", { cronSecret: "s3cret", stockProviderKey: undefined });
    expect((await response).status).toBe(500);
    expect(runIngest).not.toHaveBeenCalled();
  });
});
