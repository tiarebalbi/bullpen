import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlDocument } from "./adl.js";
import { ADL_RULE } from "./rules.js";
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
    expect(text).toMatch(/\(structure\.adl:8\)\.$/m);
  });

  it("recognises the rule by its shape, so a second secret is one more ADL line", () => {
    const header = "DESCRIPTION d\nCATEGORY c\nDEFINE SYSTEM S AS s\n\n# Secrets\n";
    const [secret] = parseAdlDocument(`${header}ASSERT(ONLY apps/x READS OTHER_KEY)`).rules;
    expect(secret!.form).toEqual({ form: "secret", directory: "apps/x", secret: "OTHER_KEY" });
    const [entryPoint] = parseAdlDocument(`${header}ASSERT(${ADL_RULE.entryPoint})`).rules;
    expect(entryPoint!.form.form).toBe("free");
  });

  it("passes the real repo: the key is read in apps/web/app/api/price and nowhere else", () => {
    expect(checkSecretContainment(realRepoRoot)).toEqual([]);
  });
});
