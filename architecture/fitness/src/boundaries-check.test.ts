import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadAdlDocument } from "./adl.js";
import { BOUNDARIES_RULE, checkBoundaries, parseBoundariesOutput, type BoundariesRun } from "./boundaries-check.js";
import { checkBoundaryTags, expectedTagRules } from "./boundary-tags.js";
import { copyFixture, expectFailureFormat, expectNoAbsolutePaths, fixturesRoot, readJsonFile, writeJsonFile } from "./test-helpers.js";
import type { Violation } from "./violation.js";

// The first invocation may fetch the standalone turbo binary via npx, which
// can be slow, so the real-mechanism runs get a generous timeout.
const TIMEOUT_MS = 180_000;

const fixture = (name: string) => join(fixturesRoot, name);

/** The ASSERT as written in the fixture's own structure.adl, and the line it is on. */
function assertIn(name: string, text: string): { text: string; cite: string } {
  const rule = loadAdlDocument(fixture(name)).rules.find((candidate) => candidate.text === text);
  if (!rule) throw new Error(`${name}/structure.adl has no ASSERT(${text})`);
  return { text, cite: `structure.adl:${rule.line}` };
}

describe("turbo boundaries, through the wrapper (real mechanism, no mocking)", () => {
  const results = new Map<string, Violation[]>();
  const run = (name: string): Violation[] => results.get(name)!;

  // One real turbo run per fixture, shared by the tests below.
  beforeAll(() => {
    for (const name of [
      "boundaries-good",
      "boundaries-library-ok",
      "boundaries-violation",
      "boundaries-library-violation",
      "boundaries-relative-import",
      "boundaries-laundered",
      "boundaries-allowlist-violation",
    ]) {
      results.set(name, checkBoundaries(fixture(name)));
    }
  }, TIMEOUT_MS);

  it("passes when no component depends on or imports another", () => {
    expect(run("boundaries-good")).toEqual([]);
  });

  it("passes apps that depend on the libraries they may, and a library that depends on another", () => {
    expect(run("boundaries-library-ok")).toEqual([]);
  });

  it("fails a component that depends on one it has no dependency on, quoting the ASSERT and naming the package.json to edit", () => {
    const rule = assertIn("boundaries-violation", "Landing HAS NO DEPENDENCY ON Trading App");
    const [violation] = run("boundaries-violation");

    expect(run("boundaries-violation")).toHaveLength(1);
    expect(violation!.check).toBe("turbo boundaries");
    expect(violation!.rule).toBe(rule.text);
    expect(violation!.where).toBe("apps/landing/package.json");
    expect(violation!.why).toBe(`Landing depends on Trading App: @fixture/landing lists @fixture/trading-app in its package.json, and it must not (${rule.cite}).`);
    expect(violation!.fix).toContain("Remove @fixture/trading-app from @fixture/landing's dependencies");
  });

  it("fails a library that depends on an app, under the library's own HAS NO DEPENDENCY ON line", () => {
    const rule = assertIn("boundaries-library-violation", "UI HAS NO DEPENDENCY ON Landing, Trading App");
    const [violation] = run("boundaries-library-violation");

    expect(run("boundaries-library-violation")).toHaveLength(1);
    expect(violation!.rule).toBe(rule.text);
    expect(violation!.where).toBe("packages/ui/package.json");
    expect(violation!.why).toContain("UI depends on Landing");
    expect(violation!.why).toContain(rule.cite);
  });

  it("fails a relative import that reaches into another component, naming file and line", () => {
    const rule = assertIn("boundaries-relative-import", "Landing HAS NO DEPENDENCY ON Trading App");
    const [violation] = run("boundaries-relative-import");

    expect(run("boundaries-relative-import")).toHaveLength(1);
    expect(violation!.rule).toBe(rule.text);
    expect(violation!.where).toBe("apps/landing/src/index.ts:1");
    expect(violation!.why).toContain("resolves into apps/trading-app");
    expect(violation!.fix).toContain("a library that both may depend on");
  });

  it("applies HAS NO DEPENDENCY ON transitively: an app that reaches the other app through a library fails, with the path", () => {
    const rule = assertIn("boundaries-laundered", "Landing HAS NO DEPENDENCY ON Trading App");
    const violations = run("boundaries-laundered");

    expect(violations).toHaveLength(1);
    expect(violations[0]!.rule).toBe(rule.text);
    expect(violations[0]!.where).toBe("packages/ui/package.json");
    expect(violations[0]!.why).toBe(
      `Landing depends on Trading App through UI: @fixture/landing → @fixture/ui → @fixture/trading-app, and it must not (${rule.cite}).`,
    );
    expect(violations[0]!.fix).toContain("Remove @fixture/trading-app from @fixture/ui's dependencies, the last link of that chain");
  });

  it("fails a dependency outside the component's IS DEPENDENT ON list", () => {
    const rule = assertIn("boundaries-allowlist-violation", "Landing IS DEPENDENT ON UI, Contracts");
    const [violation] = run("boundaries-allowlist-violation");

    expect(run("boundaries-allowlist-violation")).toHaveLength(1);
    expect(violation!.rule).toBe(rule.text);
    expect(violation!.where).toBe("apps/landing/package.json");
    expect(violation!.why).toContain("Landing depends on Extras");
    expect(violation!.why).toContain("which is not on its allowed list (UI, Contracts)");
    expect(violation!.why).toContain(rule.cite);
  });

  it("fails in the shared format with repo-relative paths only, even though turbo prints absolute ones", () => {
    for (const name of ["boundaries-violation", "boundaries-library-violation", "boundaries-relative-import", "boundaries-laundered", "boundaries-allowlist-violation"]) {
      const text = expectFailureFormat(run(name)[0]!, "turbo boundaries");
      expectNoAbsolutePaths(text);
      expect(text).toContain("✗ turbo boundaries: ");
    }
  });
});

describe("turbo.json and the ADL say the same thing", () => {
  const document = loadAdlDocument(fixture("boundaries-good"));
  const edit = (change: (turbo: ReturnType<typeof readTurbo>) => void): string => {
    const root = copyFixture("boundaries-good");
    const turbo = readTurbo(root);
    change(turbo);
    writeJsonFile(root, "turbo.json", turbo);
    return root;
  };
  function readTurbo(root: string) {
    return readJsonFile<{ boundaries: { tags: Record<string, { dependencies: { allow?: string[]; deny?: string[] } }> } }>(root, "turbo.json");
  }

  it("derives an allow-list from IS DEPENDENT ON and a deny-list from HAS NO DEPENDENCY ON, over tags", () => {
    const expected = expectedTagRules(document);
    expect([...expected.get("landing")!.allow]).toEqual(["ui", "contracts"]);
    expect([...expected.get("landing")!.deny]).toEqual(["trading-app"]);
    expect([...expected.get("ui")!.deny]).toEqual(["landing", "trading-app"]);
    expect(expected.get("ui")!.allow.size).toBe(0);
  });

  it("passes when turbo.json holds exactly the rules the ADL states, and every component carries its tag", () => {
    expect(checkBoundaryTags(fixture("boundaries-good"), document)).toEqual([]);
  });

  it("fails a rule the ADL states and turbo.json lost, quoting the ASSERT", () => {
    const root = edit((turbo) => {
      turbo.boundaries.tags["landing"]!.dependencies.deny = [];
    });
    const [violation] = checkBoundaryTags(root, document);

    expect(violation!.rule).toBe("Landing HAS NO DEPENDENCY ON Trading App");
    expect(violation!.where).toBe("turbo.json");
    expect(violation!.fix).toBe('Add "trading-app" to boundaries.tags.landing.dependencies.deny in turbo.json.');
    expectFailureFormat(violation!, "turbo boundaries");
  });

  it("fails a rule turbo.json holds and no ASSERT states", () => {
    const root = edit((turbo) => {
      turbo.boundaries.tags["contracts"]!.dependencies.deny!.push("ui");
    });
    const [violation] = checkBoundaryTags(root, document);

    expect(violation!.rule).toBe(BOUNDARIES_RULE);
    expect(violation!.why).toContain('denies the tag "ui" for the tag "contracts"');
  });

  it("fails a component that does not carry its tag, since turbo cannot then apply any rule that names it", () => {
    const root = copyFixture("boundaries-good");
    writeFileSync(join(root, "packages", "ui", "turbo.json"), '{ "tags": [] }\n');
    const [violation] = checkBoundaryTags(root, document);

    expect(violation!.where).toBe("packages/ui/turbo.json");
    expect(violation!.fix).toBe('Set "tags": ["ui"] in packages/ui/turbo.json.');
  });

  it("fails closed when turbo.json is gone", () => {
    const root = copyFixture("boundaries-good");
    writeFileSync(join(root, "turbo.json"), "not json");
    expect(checkBoundaryTags(root, document)[0]!.why).toContain("missing or is not valid JSON");
  });

  it("holds the real repo to it", () => {
    const real = join(fixturesRoot, "..", "..", "..", "..");
    expect(checkBoundaryTags(real, loadAdlDocument(real))).toEqual([]);
    expect(readFileSync(join(real, "turbo.json"), "utf8")).toContain('"trading-app"');
  });
});

describe("parseBoundariesOutput", () => {
  const output = [
    "Checking packages...",
    "  x Package `app-b` found with tag listed in denylist for `app-a`: `app`",
    "   ,-[apps/app-b/turbo.json:1:12]",
    " 1 | { \"tags\": [\"app\"] }",
    "   :            ^^|^^",
    "   `----",
    "  `->   x denylist defined here",
    "          ,-[turbo.json:9:35]",
    "  x import `../../app-b/src/index.ts` leaves the package",
    "   ,-[/some/abs/path/apps/app-a/src/index.ts:3:23]",
    " 3 | import { hello } from \"../../app-b/src/index.ts\";",
    "",
    "Checked 2 files in 2 packages, 2 issues found",
  ].join("\n");

  it("finds each issue's message and the first location in its block", () => {
    const findings = parseBoundariesOutput(output);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toMatchObject({ message: expect.stringContaining("denylist for `app-a`"), file: "apps/app-b/turbo.json", line: 1 });
    expect(findings[1]).toMatchObject({ message: expect.stringContaining("leaves the package"), file: "/some/abs/path/apps/app-a/src/index.ts", line: 3 });
  });

  it("ignores warnings and nested 'denylist defined here' notes", () => {
    expect(parseBoundariesOutput(" WARNING  lockfile not found\n  `->   x denylist defined here\nChecked 1 files in 1 packages, no issues found")).toEqual([]);
  });

  it("puts a message back together when turbo wraps it at 80 columns, after a slash, a hyphen or a space", () => {
    const wrapped = [
      "  x Package `@bullpen/web` found with tag listed in denylist for `@bullpen/",
      "  | landing`: `trading-",
      "  | app`",
      "   ,-[apps/web/turbo.json:1:30]",
      "  x Package `@bullpen/web` found without any tag listed in allowlist for",
      "  | `@bullpen/landing`",
      "   ,-[apps/web/turbo.json:1:30]",
    ].join("\n");
    const [denied, allowlisted] = parseBoundariesOutput(wrapped);

    expect(denied!.message).toBe("Package `@bullpen/web` found with tag listed in denylist for `@bullpen/landing`: `trading-app`");
    expect(allowlisted!.message).toBe("Package `@bullpen/web` found without any tag listed in allowlist for `@bullpen/landing`");
    expect(denied!.file).toBe("apps/web/turbo.json");
  });
});

describe("checkBoundaries fails closed", () => {
  const runner = (run: BoundariesRun) => () => run;
  const root = "/repo/root";

  it("reports turbo itself failing to start", () => {
    const [violation] = checkBoundaries(root, runner({ status: null, stdout: "", stderr: "", error: "spawn turbo ENOENT" }));
    expect(violation!.rule).toBe(BOUNDARIES_RULE);
    expect(violation!.why).toContain("could not run");
    expectFailureFormat(violation!, "turbo boundaries");
  });

  it("reports a non-zero exit with no issue it can name", () => {
    const [violation] = checkBoundaries(root, runner({ status: 1, stdout: "", stderr: "boom" }));
    expect(violation!.why).toContain("exited with status 1 without naming an issue");
  });

  it("passes a clean run", () => {
    expect(checkBoundaries(root, runner({ status: 0, stdout: "Checked 3 files in 2 packages, no issues found", stderr: "" }))).toEqual([]);
  });

  it("keeps an issue it does not recognise, quoting turbo", () => {
    const [violation] = checkBoundaries(root, runner({ status: 1, stdout: "", stderr: "  x something new turbo reports\n   ,-[apps/a/x.ts:2:1]\n" }));
    expect(violation!.rule).toBe(BOUNDARIES_RULE);
    expect(violation!.where).toBe("apps/a/x.ts:2");
    expect(violation!.why).toContain("something new turbo reports");
  });
});
