import { describe, expect, it, vi } from "vitest";
import { createPool } from "./index.js";

describe("a market-data pool whose idle connection the database closes", () => {
  it("logs one line and carries on, instead of ending the process on an unhandled error event", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pool = createPool("postgres://u:p@127.0.0.1:1/db");
    expect(pool.listenerCount("error")).toBeGreaterThanOrEqual(1);
    expect(() => pool.emit("error", Object.assign(new Error("terminating connection due to administrator command"), { code: "57P01" }))).not.toThrow();
    expect(JSON.parse(String(log.mock.calls[0]![0]))).toEqual({ at: "market-data.pool.idle-error", code: "57P01", message: "terminating connection due to administrator command" });
    log.mockRestore();
    await pool.end();
  });
});
