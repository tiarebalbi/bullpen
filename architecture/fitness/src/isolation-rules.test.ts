import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findAdlFile, parseAdlDocument } from "./adl.js";
import { checkImportBoundaries } from "./import-boundary-check.js";
import { expectFailureFormat, fixturesRoot, realRepoRoot } from "./test-helpers.js";

/** The rule Part 5 adds, worded exactly as architecture/adl/structure.adl states it (ADR-0030). */
const NO_ORDER_POOL_IN_READS =
  "NO apps/web/app/api/leaderboard, apps/web/app/api/stock-prices, apps/web/app/api/prices, apps/web/app/lib/trading/reads IMPORTS apps/web/app/lib/trading/orders";

describe("reads never take the order path's connections", () => {
  it("is stated in the real ADL, as written, and read by its shape", () => {
    const adl = parseAdlDocument(readFileSync(join(realRepoRoot, findAdlFile(realRepoRoot)!), "utf8"));
    const rule = adl.rules.find((r) => r.text === NO_ORDER_POOL_IN_READS);
    expect(rule?.form).toEqual({
      form: "no-import",
      directories: ["apps/web/app/api/leaderboard", "apps/web/app/api/stock-prices", "apps/web/app/api/prices", "apps/web/app/lib/trading/reads"],
      target: "apps/web/app/lib/trading/orders",
    });
  });

  it("passes when the read routes use the read pool, the order route uses the order pool, and a comment shows the forbidden import", () => {
    expect(checkImportBoundaries(join(fixturesRoot, "isolation-imports-ok"))).toEqual([]);
  });

  it("fails a read route that imports the order pool, and a file in the reads directory that re-exports it, and no other file", () => {
    const violations = checkImportBoundaries(join(fixturesRoot, "isolation-imports-violation"));
    expect(violations.map((v) => v.where).sort()).toEqual(["apps/web/app/api/leaderboard/route.ts:1", "apps/web/app/lib/trading/reads/leak.ts:1"]);
    expect(new Set(violations.map((v) => v.rule))).toEqual(new Set([NO_ORDER_POOL_IN_READS]));
  });

  it("fails in the shared format, naming the file, the import and the fix", () => {
    const violation = checkImportBoundaries(join(fixturesRoot, "isolation-imports-violation")).find((v) => v.where.startsWith("apps/web/app/api/leaderboard"))!;
    const text = expectFailureFormat(violation, "import boundaries");
    expect(text).toContain(`✗ import boundaries: ${NO_ORDER_POOL_IN_READS}`);
    expect(text).toContain("  where:   apps/web/app/api/leaderboard/route.ts:1");
    expect(text).toContain("apps/web/app/api/leaderboard/route.ts imports ../../lib/trading/orders/pool.js, which is apps/web/app/lib/trading/orders");
  });

  it("passes the real repo", () => {
    expect(checkImportBoundaries(realRepoRoot)).toEqual([]);
  });
});
