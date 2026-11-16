import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The process, with SWEEPER_EXIT_WHEN_IDLE (ADR-0033), against a stand-in route: it leaves on its own with exit code 0 when nothing is open, and without the variable it does not.
const main = fileURLToPath(new URL("./main.ts", import.meta.url));
const far = new Date(Date.now() + 24 * 3600_000).toISOString();

async function serve(): Promise<{ url: string; calls: () => number; close: () => void }> {
  let calls = 0;
  const server = createServer((_req, res) => {
    calls += 1;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ open: 0, nextOpen: far }));
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/sweep`, calls: () => calls, close: () => server.close() };
}

const start = (env: Record<string, string>) => spawn(process.execPath, [main], { env: { PATH: process.env.PATH ?? "", SWEEPER_TOKEN: "SECRET-TOKEN", ...env }, stdio: ["ignore", "pipe", "pipe"] });
const exited = (child: ReturnType<typeof start>) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    let out = "";
    child.stdout!.on("data", (d) => (out += d));
    child.on("exit", (code) => resolve({ code, out }));
  });

describe("the sweeper process with SWEEPER_EXIT_WHEN_IDLE=1", () => {
  it("makes one call, says why it is leaving, and exits 0 by itself when nothing is open and no open is near", async () => {
    const route = await serve();
    const child = start({ SWEEPER_TARGET_URL: route.url, SWEEPER_EXIT_WHEN_IDLE: "1" });
    const { code, out } = await exited(child);
    expect(code).toBe(0);
    expect(route.calls()).toBe(1);
    expect(out).toContain('"outcome":"idle-exit"');
    expect(out).toContain('"outcome":"stopped"');
    expect(out).not.toContain("SECRET-TOKEN");
    route.close();
  }, 20_000);

  it("without the variable it keeps running until it is told to stop", async () => {
    const route = await serve();
    const child = start({ SWEEPER_TARGET_URL: route.url });
    const done = exited(child);
    for (let i = 0; i < 100 && route.calls() === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    expect(child.exitCode).toBeNull(); // still running after its first, idle call
    child.kill("SIGTERM");
    expect((await done).code).toBe(0);
    route.close();
  }, 20_000);

  it("only the value 1 turns it on", async () => {
    const route = await serve();
    const child = start({ SWEEPER_TARGET_URL: route.url, SWEEPER_EXIT_WHEN_IDLE: "true" });
    const done = exited(child);
    for (let i = 0; i < 100 && route.calls() === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    await new Promise((r) => setTimeout(r, 300));
    expect(child.exitCode).toBeNull();
    child.kill("SIGTERM");
    await done;
    route.close();
  }, 20_000);
});
