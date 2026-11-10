import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { askGateway } from "./gateway.js";
import { saveAndModerate } from "./moderate.js";

// One code path to the gateway. The measurement (scripts/measure-moderation.ts) must ask the question the way production does, or its numbers say nothing about production:
// it has to call the same function, with the same request, parser and failure rules, and nothing else may reach the gateway.
const web = join(import.meta.dirname, "..", "..", "..");
const read = (path: string): string => readFileSync(join(web, path), "utf8");
const code = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" || name === ".next" || name === ".generated" ? [] : sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the measure script and production share one gateway module", () => {
  it("the script imports askGateway from the moderation module and calls it with the handle alone", () => {
    const script = read("scripts/measure-moderation.ts");
    expect(script).toMatch(/import \{[^}]*\baskGateway\b[^}]*\} from "\.\.\/app\/lib\/moderation\/gateway\.js";/);
    expect(code(script)).toContain("askGateway(item.handle)");
    // no options: the default fetch, the default key from the environment, the default timeout
    expect(code(script)).not.toMatch(/askGateway\([^)]*,/);
  });

  it("the script has no request, endpoint, key or response parser of its own", () => {
    const script = code(read("scripts/measure-moderation.ts"));
    for (const forbidden of [/\bfetch\s*\(/, /ai-gateway\.vercel\.sh/, /\/v1\//, /AI_GATEWAY_API_KEY/, /\.answers\b/, /provider_metadata/, /Authorization/i]) expect(script).not.toMatch(forbidden);
  });

  it("production asks through the same function: the save path defaults to askGateway from the same module", () => {
    const moderate = read("app/lib/moderation/moderate.ts");
    expect(moderate).toMatch(/import \{[^}]*\baskGateway\b[^}]*\} from "\.\/gateway\.js";/);
    expect(code(moderate)).toMatch(/deps\.ask \?\? askGateway/);
  });

  it("nothing else in the app or its scripts names the gateway or reads its key", () => {
    const offenders = [...sourceFiles(join(web, "app")), ...sourceFiles(join(web, "scripts"))]
      .filter((path) => !path.endsWith(join("app", "lib", "moderation", "gateway.ts")))
      .filter((path) => /ai-gateway\.vercel\.sh|process\.env\.AI_GATEWAY_API_KEY|\/v1\/decisions/.test(code(readFileSync(path, "utf8"))));
    expect(offenders).toEqual([]);
  });

  it("the request the save path sends is the request the measure script's call sends: same URL, headers and body", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key-not-real");
    const answer = () => new Response(JSON.stringify({ model: "typesafe-ai/jev", answers: [{ type: "predicate", name: "acceptable", probability: 0.99 }] }), { status: 200 });
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return answer();
    }));

    // what the script does: askGateway(handle), no options
    await askGateway("Bull_Run");
    // what production does: the save path, with its default ask
    const store = { submit: async () => ({ ok: true as const, handleId: "h-1" }), record: async () => true };
    await saveAndModerate("user-1", "Bull_Run", { store, log: () => undefined });

    expect(seen).toHaveLength(2);
    const [script, production] = seen as [(typeof seen)[number], (typeof seen)[number]];
    expect(production.url).toBe(script.url);
    expect(script.url).toBe("https://ai-gateway.vercel.sh/v1/decisions");
    expect(production.init.body).toBe(script.init.body);
    expect(production.init.headers).toEqual(script.init.headers);
    expect(production.init.method).toBe(script.init.method);
    expect(production.init.redirect).toBe(script.init.redirect);
  });

  it("an answer the production path would send to review is a failure in the measurement too, not a silent score", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key-not-real");
    // a valid-looking answer that names no model
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ answers: [{ type: "predicate", name: "acceptable", probability: 0.99 }] }), { status: 200 })));
    expect(await askGateway("Bull_Run")).toMatchObject({ ok: false, reason: "malformed" });
  });
});
