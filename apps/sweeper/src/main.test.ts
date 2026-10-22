import { spawn } from "node:child_process";
import { createServer, type IncomingMessage } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const main = fileURLToPath(new URL("./main.ts", import.meta.url));

const start = (env: Record<string, string>) => spawn(process.execPath, [main], { env: { PATH: process.env.PATH ?? "", ...env }, stdio: ["ignore", "pipe", "pipe"] });
const exited = (child: ReturnType<typeof start>) => new Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string }>((resolve) => {
  let out = "";
  child.stdout!.on("data", (d) => (out += d));
  child.on("exit", (code, signal) => resolve({ code, signal, out }));
});

describe("the sweeper process", () => {
  it("on SIGTERM in the middle of a call, abandons it and exits 0 at once", async () => {
    const seen: IncomingMessage[] = [];
    const server = createServer((req) => { seen.push(req); /* never answers: the call is in flight */ });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const child = start({ SWEEPER_TARGET_URL: `http://127.0.0.1:${port}/api/internal/sweep`, SWEEPER_TOKEN: "SECRET-TOKEN" });
    const done = exited(child);
    for (let i = 0; i < 100 && seen.length === 0; i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(seen).toHaveLength(1);
    expect(seen[0]!.method).toBe("POST");
    expect(seen[0]!.headers.authorization).toBe("Bearer SECRET-TOKEN");
    const killedAt = Date.now();
    child.kill("SIGTERM");
    const result = await done;
    expect(result.code).toBe(0);
    expect(Date.now() - killedAt).toBeLessThan(2000);
    expect(result.out).toContain('"outcome":"stopped"');
    expect(result.out).not.toContain("SECRET-TOKEN");
    server.closeAllConnections();
    server.close();
  }, 20_000);

  it("with no configuration, says so once, waits instead of exiting, and stops on SIGTERM", async () => {
    const child = start({});
    const done = exited(child);
    // Only once it has said so is its SIGTERM handler in place: under load a fixed wait is not enough.
    let said = "";
    child.stdout!.on("data", (d) => (said += d));
    for (let i = 0; i < 200 && !said.includes("not-configured"); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(said).toContain("not-configured");
    expect(child.exitCode).toBeNull();
    child.kill("SIGTERM");
    const result = await done;
    expect(result.code).toBe(0);
    expect(result.out).toContain("not-configured");
  }, 20_000);

  it("with a target URL that stops short of the sweep route, names the problem, makes no call, and stops on SIGTERM", async () => {
    const seen: IncomingMessage[] = [];
    const server = createServer((req, res) => { seen.push(req); res.statusCode = 405; res.end(); });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    const child = start({ SWEEPER_TARGET_URL: `http://127.0.0.1:${port}`, SWEEPER_TOKEN: "SECRET-TOKEN" });
    const done = exited(child);
    let said = "";
    child.stdout!.on("data", (d) => (said += d));
    for (let i = 0; i < 200 && !said.includes("not-configured"); i += 1) await new Promise((r) => setTimeout(r, 50));
    expect(said).toContain('"outcome":"not-configured"');
    expect(said).toContain("SWEEPER_TARGET_URL must end at /api/internal/sweep");
    expect(said).not.toContain("SECRET-TOKEN");
    child.kill("SIGTERM");
    expect((await done).code).toBe(0);
    expect(seen).toHaveLength(0);
    server.close();
  }, 20_000);
});
