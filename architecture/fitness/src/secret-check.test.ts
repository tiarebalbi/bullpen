import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ADL_RULE, SECRET_RULE_PATTERN } from "./rules.js";
import { checkSecretContainment } from "./secret-check.js";
import { expectFailureFormat, fixturesRoot, realRepoRoot } from "./test-helpers.js";

const RULE = "ONLY apps/web/app/api/price READS COINGECKO_DEMO_API_KEY";

describe("checkSecretContainment", () => {
  it("passes when only the allowed directory reads the secret, and everything else merely mentions it", () => {
    // secret-ok mentions the name in line and block comments and in .env.example.
    expect(checkSecretContainment(join(fixturesRoot, "secret-ok"))).toEqual([]);
  });

  it("fails a second reader, naming the file, the line, the secret and where it may be read", () => {
    const [violation] = checkSecretContainment(join(fixturesRoot, "secret-violation"));

    expect(violation).toBeDefined();
    expect(violation!.rule).toBe(RULE);
    expect(violation!.where).toBe("apps/landing/app/page.ts:2");
    expect(violation!.why).toContain("COINGECKO_DEMO_API_KEY");
    expect(violation!.why).toContain("only apps/web/app/api/price may read");
    expect(violation!.fix).toContain("Move the read into apps/web/app/api/price");
  });

  it("does not flag the allowed reader itself", () => {
    const wheres = checkSecretContainment(join(fixturesRoot, "secret-violation")).map((v) => v.where);
    expect(wheres.some((w) => w.startsWith("apps/web/app/api/price"))).toBe(false);
  });

  it("fails in the shared format, citing the ADL line", () => {
    const [violation] = checkSecretContainment(join(fixturesRoot, "secret-violation"));
    const text = expectFailureFormat(violation!, "secret containment");
    expect(text).toContain(`✗ secret containment: ${RULE}`);
    expect(text).toMatch(/\(structure\.adl:7\)\.$/m);
  });

  it("recognises the rule by its shape, so a second secret is one more ADL line", () => {
    expect(SECRET_RULE_PATTERN.exec("ONLY apps/x READS OTHER_KEY")?.slice(1)).toEqual(["apps/x", "OTHER_KEY"]);
    expect(SECRET_RULE_PATTERN.test(ADL_RULE.entryPoint)).toBe(false);
  });

  it("passes the real repo: the key is read in apps/web/app/api/price and nowhere else", () => {
    expect(checkSecretContainment(realRepoRoot)).toEqual([]);
  });
});
