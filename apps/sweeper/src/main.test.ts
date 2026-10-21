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
    await new Promise((r) => setTimeout(r, 500));
    expect(child.exitCode).toBeNull();
    child.kill("SIGTERM");
    const result = await done;
    expect(result.code).toBe(0);
    expect(result.out).toContain("not-configured");
  }, 20_000);
});
