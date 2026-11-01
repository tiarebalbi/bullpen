import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findAdlFile, parseAdlDocument } from "./adl.js";
import { checkDataOwnership } from "./data-ownership-check.js";
import { checkImportBoundaries } from "./import-boundary-check.js";
import { checkSecretContainment } from "./secret-check.js";
import { expectFailureFormat, fixturesRoot, realRepoRoot } from "./test-helpers.js";
import { formatViolation } from "./violation.js";

/** The three rules the bonus adds, worded exactly as architecture/adl/structure.adl states them. */
const GATEWAY_KEY = "ONLY apps/web/app/lib/moderation READS AI_GATEWAY_API_KEY";
const GATEWAY_HOST = "ONLY apps/web/app/lib/moderation READS ai-gateway.vercel.sh";
const NO_IMPORT = "NO packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading IMPORTS apps/web/app/lib/moderation";
const NO_WRITE = "ONLY trading WRITES trading";

describe("the rules are stated in the real ADL, as written", () => {
  const adl = parseAdlDocument(readFileSync(join(realRepoRoot, findAdlFile(realRepoRoot)!), "utf8"));
  it.each([GATEWAY_KEY, GATEWAY_HOST, NO_IMPORT, NO_WRITE])("states ASSERT(%s)", (text) => {
    expect(adl.rules.some((rule) => rule.text === text)).toBe(true);
  });

  it("reads the import rule by its shape", () => {
    const rule = adl.rules.find((r) => r.text === NO_IMPORT)!;
    expect(rule.form).toEqual({ form: "no-import", directories: ["packages/db-trading", "packages/db-market-data", "apps/market-data", "apps/web/app/lib/trading"], target: "apps/web/app/lib/moderation" });
  });
});

describe("1. only the moderation module reads the gateway key or calls the gateway", () => {
  it("passes when only moderation reads the key and calls the host, and everything else merely mentions them", () => {
    expect(checkSecretContainment(join(fixturesRoot, "moderation-gateway-ok"))).toEqual([]);
  });

  it("fails a second reader of the key and a second caller of the host, each at its line", () => {
    const violations = checkSecretContainment(join(fixturesRoot, "moderation-gateway-violation"));
    expect(violations.map((v) => [v.rule, v.where])).toEqual([
      [GATEWAY_KEY, "apps/web/app/lib/trading/leak.ts:2"],
      [GATEWAY_HOST, "apps/web/app/lib/trading/leak.ts:3"],
    ]);
  });

  it("fails in the shared format and says what to do", () => {
    const [key, host] = checkSecretContainment(join(fixturesRoot, "moderation-gateway-violation"));
    expect(expectFailureFormat(key!, "secret containment")).toBe(
      [
        `✗ secret containment: ${GATEWAY_KEY}`,
        "  where:   apps/web/app/lib/trading/leak.ts:2",
        "  why:     apps/web/app/lib/trading/leak.ts reads AI_GATEWAY_API_KEY, which only apps/web/app/lib/moderation may read, so the secret stays in one place (structure.adl:7).",
        "  fix:     Move the read into apps/web/app/lib/moderation and pass the result out, or call that route instead of reading AI_GATEWAY_API_KEY here.",
      ].join("\n"),
    );
    expect(formatViolation(host!)).toContain("reads ai-gateway.vercel.sh, which only apps/web/app/lib/moderation may read");
  });

  it("passes the real repo: the key and the host appear only in apps/web/app/lib/moderation", () => {
    expect(checkSecretContainment(realRepoRoot)).toEqual([]);
  });
});

describe("2. trading and market-data code never import moderation", () => {
  it("passes when they do not, whatever else imports moderation, and ignores a comment that shows an import", () => {
    expect(checkImportBoundaries(join(fixturesRoot, "moderation-imports-ok"))).toEqual([]);
  });

  it("fails an import from trading code, from the trading package and from the market-data service, by relative path or dynamic import", () => {
    const violations = checkImportBoundaries(join(fixturesRoot, "moderation-imports-violation"));
    expect(violations.map((v) => v.where).sort()).toEqual(["apps/market-data/src/leak.ts:1", "apps/web/app/lib/trading/leak.ts:1", "packages/db-trading/src/leak.ts:1"]);
    expect(new Set(violations.map((v) => v.rule))).toEqual(new Set([NO_IMPORT]));
  });

  it("fails in the shared format, naming the file, the import and the fix", () => {
    const violation = checkImportBoundaries(join(fixturesRoot, "moderation-imports-violation")).find((v) => v.where.startsWith("apps/web/app/lib/trading"))!;
    expect(expectFailureFormat(violation, "import boundaries")).toBe(
      [
        `✗ import boundaries: ${NO_IMPORT}`,
        "  where:   apps/web/app/lib/trading/leak.ts:1",
        "  why:     apps/web/app/lib/trading/leak.ts imports ../moderation/moderate.js, which is apps/web/app/lib/moderation, and code in packages/db-trading, packages/db-market-data, apps/market-data, apps/web/app/lib/trading may not (structure.adl:10).",
        "  fix:     Remove the import. If apps/web/app/lib/trading/leak.ts needs what apps/web/app/lib/moderation does, move that into code both may import, or ask for a new decision (an ADR).",
      ].join("\n"),
    );
  });

  it("passes the real repo", () => {
    expect(checkImportBoundaries(realRepoRoot)).toEqual([]);
  });
});

describe("3. moderation never writes the trading schema", () => {
  it("passes when only the trading package writes trading, and moderation only reads handles' view", () => {
    expect(checkDataOwnership(join(fixturesRoot, "moderation-writes-ok"))).toEqual([]);
  });

  it("fails a write to trading from moderation, and a write grant on trading to the handles role (which the migration-folder rule also catches)", () => {
    const violations = checkDataOwnership(join(fixturesRoot, "moderation-writes-violation"));
    expect(violations.map((v) => [v.rule, v.where]).sort()).toEqual(
      [
        [NO_WRITE, "apps/web/app/lib/moderation/bad.ts:2"],
        [NO_WRITE, "packages/db-handles/migrations/0003_bad_grant.sql:1"],
        // the migration-folder rule (ADR-0012) fails on the same file: a migration touches only its own owner's schema
        ["a migration in one owner's folder touches only that owner's schema", "packages/db-handles/migrations/0003_bad_grant.sql:1"],
      ].sort(),
    );
  });

  it("fails in the shared format", () => {
    const violation = checkDataOwnership(join(fixturesRoot, "moderation-writes-violation")).find((v) => v.where.startsWith("apps/web/app/lib/moderation"))!;
    expect(expectFailureFormat(violation, "data ownership")).toBe(
      [
        `✗ data ownership: ${NO_WRITE}`,
        "  where:   apps/web/app/lib/moderation/bad.ts:2",
        "  why:     apps/web/app/lib/moderation/bad.ts writes trading, which only trading (packages/db-trading) may write (structure.adl:9).",
        "  fix:     Move the write into packages/db-trading, or ask trading to expose it.",
      ].join("\n"),
    );
    const grant = checkDataOwnership(join(fixturesRoot, "moderation-writes-violation")).find((v) => v.where.endsWith(".sql:1"))!;
    expect(grant.why).toContain("grants a write on trading to handles_owner, but only trading_owner (trading) may write it");
  });

  it("passes the real repo", () => {
    expect(checkDataOwnership(realRepoRoot)).toEqual([]);
  });
});
