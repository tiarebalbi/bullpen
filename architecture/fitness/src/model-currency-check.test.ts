import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadAdlDocument } from "./adl.js";
import { ADR_LINKED_RULE, CONTROL_POINTER_RULE, EXTERNAL_SYSTEM_RULE, checkModelCurrency, latestBuiltMoment } from "./model-currency-check.js";
import { ADL_RULE } from "./rules.js";
import { copyFixture, expectFailureFormat, fixturesRoot, readJsonFile, realRepoRoot, writeJsonFile } from "./test-helpers.js";

const GOOD = join(fixturesRoot, "model-currency-good");
const entriesOf = (root: string) => loadAdlDocument(root).entries;

interface Doc {
  nodes: Array<Record<string, unknown>>;
}
interface Timeline {
  "current-moment": string;
  moments: Array<{ "unique-id": string; adrs?: string[]; details?: { "detailed-architecture": string } }>;
}

const PLANNED = "architecture/calm/planned/part-02.architecture.json";
const MOMENT = "architecture/calm/moments/part-01.architecture.json";
const TIMELINE = "architecture/calm/bullpen.timeline.json";

function withExternalSystem(name: string): string {
  const root = copyFixture("model-currency-good");
  const doc = readJsonFile<Doc>(root, PLANNED);
  doc.nodes.push({ "unique-id": "broker", "node-type": "external-system", name });
  writeJsonFile(root, PLANNED, doc);
  return root;
}

describe("model currency: a model that matches the records", () => {
  it("passes", () => {
    expect(checkModelCurrency(GOOD, entriesOf(GOOD))).toEqual([]);
  });

  it("accepts a provider decided in an ADR, and a generic label the data-sources doc defines in quotes", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, PLANNED);
    expect(doc.nodes.map((n) => n.name)).toContain("Price provider");
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });
});

describe("model currency: external systems nobody decided", () => {
  it("fails a system no decision record mentions, naming the node and the file", () => {
    const root = withExternalSystem("Stripe");
    const [violation] = checkModelCurrency(root, entriesOf(root));

    expect(violation!.where).toBe(PLANNED);
    expect(violation!.why).toContain('"broker"');
    expect(violation!.why).toContain('"Stripe"');
    expect(violation!.why).toContain("no Accepted ADR Decision");
    expect(violation!.rule).toBe(EXTERNAL_SYSTEM_RULE);
  });

  it("fails a system that an ADR lists only under Alternatives as not part of the plan", () => {
    const root = withExternalSystem("Initech");
    const [violation] = checkModelCurrency(root, entriesOf(root));

    expect(violation!.why).toContain('"Initech"');
    expect(violation!.why).toContain("ADR-0002 Alternatives");
    expect(violation!.why).toContain("only as turned down");
  });

  it("fails a system that an ADR lists under Alternatives as rejected", () => {
    const root = withExternalSystem("Globex Feed");
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain("ADR-0001 Alternatives");
  });

  it("fails a system that docs/data-sources.md lists under a rejected heading", () => {
    const root = withExternalSystem("Umbrella Quotes");
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain("docs/data-sources.md (Umbrella Quotes — rejected)");
  });

  it("fails a system the docs only mention as a second source that is not used yet", () => {
    const root = withExternalSystem("Hooli");
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain('"Hooli"');
    expect(violation!.why).toContain("only as turned down");
  });

  it("checks the current moment as well as every planned one", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    doc.nodes.push({ "unique-id": "broker", "node-type": "external-system", name: "Stripe" });
    writeJsonFile(root, MOMENT, doc);
    expect(checkModelCurrency(root, entriesOf(root))[0]!.where).toBe(MOMENT);
  });

  it("fails in the shared format, citing ADR-0009", () => {
    const root = withExternalSystem("Stripe");
    const text = expectFailureFormat(checkModelCurrency(root, entriesOf(root))[0]!, "model currency");
    expect(text).toContain(`✗ model currency: ${EXTERNAL_SYSTEM_RULE}`);
    expect(text).toContain("(ADR-0009)");

    const rejected = withExternalSystem("Initech");
    const rejectedText = expectFailureFormat(checkModelCurrency(rejected, entriesOf(rejected))[0]!, "model currency");
    expect(rejectedText).toContain("only as turned down");
  });
});

describe("model currency: only an Accepted decision authorizes the model (ADR-0016)", () => {
  const DOCS = "docs/data-sources.md";

  /** A copy of the fixture whose planned moment names `provider`, decided by an ADR with `status`. */
  function withDecidingAdr(status: string, provider = "Alpha Vantage"): string {
    const root = withExternalSystem(provider);
    writeFileSync(join(root, "architecture/adr/0008-stock-prices.md"), `# ADR-0008: Stock prices\n\n## Status\n\n${status}\n\n## Decision\n\nUse ${provider} for stock prices.\n\n## Alternatives\n\n- **Hooli** — rejected.\n`);
    return root;
  }

  it("fails a node whose provider a Proposed ADR decides, naming the node and the ADR", () => {
    const root = withDecidingAdr("Proposed");
    const [violation] = checkModelCurrency(root, entriesOf(root));

    expect(violation!.rule).toBe(EXTERNAL_SYSTEM_RULE);
    expect(violation!.where).toBe(PLANNED);
    expect(violation!.why).toContain('"broker"');
    expect(violation!.why).toContain('"Alpha Vantage"');
    expect(violation!.why).toContain("ADR-0008 is proposed");
    expect(violation!.why).toContain("only an Accepted decision authorizes the model");
    expect(violation!.fix).toContain("Accept ADR-0008");
    expectFailureFormat(violation!, "model currency");
  });

  it("passes the same model once the ADR is Accepted", () => {
    const root = withDecidingAdr("Accepted");
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });

  it("reads the status from the first line, so a note under Proposed does not make it Accepted", () => {
    const root = withDecidingAdr("Proposed\n\nClarified 2026-10-10: this was accepted in the plan.");
    expect(checkModelCurrency(root, entriesOf(root)).map((v) => v.why).join()).toContain("ADR-0008 is proposed");
  });

  it("fails a node an ADR without a status decides", () => {
    const root = withDecidingAdr("Superseded");
    expect(checkModelCurrency(root, entriesOf(root))[0]!.why).toContain("ADR-0008 is superseded");
  });

  it("lets a Proposed ADR's status govern a provider that docs/data-sources.md also lists as in use", () => {
    const root = withDecidingAdr("Proposed", "Initrode");
    writeFileSync(join(root, DOCS), `${readFileSync(join(root, DOCS), "utf8")}\n## Initrode — in use\n\nPrices come from Initrode.\n`);
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain("ADR-0008 is proposed");

    writeFileSync(join(root, "architecture/adr/0008-stock-prices.md"), readFileSync(join(root, "architecture/adr/0008-stock-prices.md"), "utf8").replace("Proposed", "Accepted"));
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });

  it("fails a provider with no ADR that docs/data-sources.md lists only as proposed", () => {
    const root = withExternalSystem("Initrode");
    writeFileSync(join(root, DOCS), `${readFileSync(join(root, DOCS), "utf8")}\n## Initrode — proposed\n\nPrices would come from Initrode.\n`);
    const [violation] = checkModelCurrency(root, entriesOf(root));

    expect(violation!.why).toContain('"Initrode"');
    expect(violation!.why).toContain("docs/data-sources.md (Initrode — proposed) lists only as proposed");
    expect(violation!.fix).toContain("as in use in docs/data-sources.md once it is decided");
  });

  it("passes a provider with no ADR that docs/data-sources.md lists as in use", () => {
    const root = withExternalSystem("Initrode");
    writeFileSync(join(root, DOCS), `${readFileSync(join(root, DOCS), "utf8")}\n## Initrode — in use\n\nPrices come from Initrode.\n`);
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });

  it("still lets an Accepted ADR's Decision decide a provider an unrelated Proposed ADR also names", () => {
    const root = withDecidingAdr("Accepted", "Initrode");
    writeFileSync(join(root, "architecture/adr/0009-later.md"), "# ADR-0009: Later\n\n## Status\n\nProposed\n\n## Decision\n\nAlso consider Initrode.\n");
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });
});

describe("model currency: every ADR is linked from its part's moment", () => {
  it("fails an ADR its part's moment does not link, naming the ADR, the moment and the fix", () => {
    const root = copyFixture("model-currency-good");
    const timeline = readJsonFile<Timeline>(root, TIMELINE);
    timeline.moments[0]!.adrs = [];
    writeJsonFile(root, TIMELINE, timeline);

    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.rule).toBe(ADR_LINKED_RULE);
    expect(violation!.where).toBe(TIMELINE);
    expect(violation!.why).toContain("ADR-0001 belongs to Part 1");
    expect(violation!.why).toContain("moment part-01");
    expect(violation!.fix).toContain('"architecture/adr/0001-quotes.md"');
  });

  it("fails an ADR whose part has no moment at all", () => {
    const root = copyFixture("model-currency-good");
    writeFileSync(join(root, "architecture/adr/0003-later.md"), readFileSync(join(root, "architecture/adr/0002-one-app.md"), "utf8").replace("## Part\n\n2", "## Part\n\n3"));
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain('no moment "part-03"');
  });

  it("fails a moment that links an ADR file that does not exist", () => {
    const root = copyFixture("model-currency-good");
    const timeline = readJsonFile<Timeline>(root, TIMELINE);
    timeline.moments[1]!.adrs!.push("architecture/adr/0099-ghost.md");
    writeJsonFile(root, TIMELINE, timeline);
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain("0099-ghost.md");
    expect(violation!.why).toContain("does not exist");
  });

  it("fails in the shared format", () => {
    const root = copyFixture("model-currency-good");
    const timeline = readJsonFile<Timeline>(root, TIMELINE);
    timeline.moments[0]!.adrs = [];
    writeJsonFile(root, TIMELINE, timeline);
    const text = expectFailureFormat(checkModelCurrency(root, entriesOf(root))[0]!, "model currency");
    expect(text).toContain(`✗ model currency: ${ADR_LINKED_RULE}`);
  });
});

describe("model currency: the ADL and the current moment describe the same components", () => {
  it("fails an ADL component that no node maps to, naming the component, the path and the file", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    delete (doc.nodes[0] as { metadata?: unknown }).metadata;
    writeJsonFile(root, MOMENT, doc);

    const violations = checkModelCurrency(root, entriesOf(root));
    const component = violations.find((v) => v.why.includes('ADL component "Web"'));
    expect(component).toBeDefined();
    expect(component!.rule).toBe(ADL_RULE.componentsMapped);
    expect(component!.where).toBe(MOMENT);
    expect(component!.why).toContain("apps/web");
    expect(component!.fix).toContain('"bullpen:path": "apps/web"');
  });

  it("fails an ADL library that no node lists", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    (doc.nodes[0] as { metadata: Record<string, unknown> }).metadata = { "bullpen:path": "apps/web" };
    writeJsonFile(root, MOMENT, doc);

    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain('ADL library "Kit" (packages/kit)');
    expect(violation!.fix).toContain("bullpen:libraries");
  });

  it("fails a webclient or service node with no bullpen:path", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    delete (doc.nodes[1] as { metadata?: unknown }).metadata;
    writeJsonFile(root, MOMENT, doc);

    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.rule).toBe(ADL_RULE.nodesMapped);
    expect(violation!.why).toContain('Node "api" (service)');
    expect(violation!.why).toContain("no bullpen:path");
  });

  it("fails a node whose path no ADL entry covers", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    (doc.nodes[1] as { metadata: Record<string, unknown> }).metadata = { "bullpen:path": "apps/elsewhere/api" };
    writeJsonFile(root, MOMENT, doc);

    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.why).toContain("apps/elsewhere/api");
    expect(violation!.fix).toContain("DEFINE a component or library");
  });

  it("follows the latest built moment, not current-moment: a missing mapping fails and names that file", () => {
    const root = copyFixture("model-currency-good");
    const next = readJsonFile<Doc>(root, MOMENT);
    for (const node of next.nodes) delete (node as { metadata?: unknown }).metadata;
    writeJsonFile(root, "architecture/calm/moments/part-02.architecture.json", next);

    const violations = checkModelCurrency(root, entriesOf(root));
    expect(violations.map((v) => v.rule)).toContain(ADL_RULE.componentsMapped);
    expect(violations.find((v) => v.rule === ADL_RULE.componentsMapped)!.where).toBe("architecture/calm/moments/part-02.architecture.json");
    expect(readJsonFile<Timeline>(root, TIMELINE)["current-moment"]).toBe("part-01");
  });

  it("passes an ADL entry that the latest built moment has and current-moment's moment does not", () => {
    const root = copyFixture("model-currency-good");
    const next = readJsonFile<Doc>(root, MOMENT);
    (next.nodes[0] as { metadata?: unknown }).metadata = { "bullpen:path": "apps/web", "bullpen:libraries": ["packages/kit", "packages/extra"] };
    writeJsonFile(root, "architecture/calm/moments/part-02.architecture.json", next);
    // part-01 (current-moment) does not list packages/extra; the ADL does not define it either, so only the latest moment is consulted.
    const adl = readFileSync(join(root, "architecture/adl/structure.adl"), "utf8");
    writeFileSync(join(root, "architecture/adl/structure.adl"), adl.replace(/(  DEFINE LIBRARY .+\n)/, "$1  DEFINE LIBRARY Extra AS packages/extra\n"));
    mkdirSync(join(root, "packages/extra"), { recursive: true });
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });

  it("names the latest built moment as the highest-numbered file in moments/", () => {
    expect(latestBuiltMoment(GOOD)).toEqual({ momentId: "part-01", file: "architecture/calm/moments/part-01.architecture.json" });
    expect(latestBuiltMoment(realRepoRoot)!.momentId).toBe("part-04");
  });

  it("fails in the shared format, citing the ADL line", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    delete (doc.nodes[0] as { metadata?: unknown }).metadata;
    writeJsonFile(root, MOMENT, doc);

    const violations = checkModelCurrency(root, entriesOf(root));
    const text = expectFailureFormat(violations.find((v) => v.rule === ADL_RULE.componentsMapped)!, "model currency");
    expect(text).toMatch(/\(structure\.adl:\d+\)\.$/m);
  });
});

describe("model currency: a control points at the check that enforces it", () => {
  function withControl(path: string): string {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, MOMENT);
    (doc.nodes[1] as Record<string, unknown>).controls = {
      "secret-containment": { requirements: [{ config: { "control-id": "CR-X", "enforced-by": path } }] },
    };
    writeJsonFile(root, MOMENT, doc);
    return root;
  }

  it("passes when the named check exists", () => {
    const root = withControl("docs/data-sources.md");
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
  });

  it("fails a control whose check is gone, naming the control, the node and the file", () => {
    const root = withControl("architecture/fitness/src/secret-check.ts");
    const [violation] = checkModelCurrency(root, entriesOf(root));

    expect(violation!.rule).toBe(CONTROL_POINTER_RULE);
    expect(violation!.where).toBe(MOMENT);
    expect(violation!.why).toContain('Control "secret-containment" on "api"');
    expect(violation!.why).toContain("architecture/fitness/src/secret-check.ts");
    expectFailureFormat(violation!, "model currency");
  });
});

describe("model currency: the planned Part 2 moment, which must stay exactly as written", () => {
  // planned/part-02 still names its provider "Market Data Provider", from before CoinGecko was
  // decided. Part 6 compares predictions with what shipped, so that file is never edited. It passes
  // the drift check because docs/data-sources.md defines that label in a quoted sentence. This test
  // names that dependency, so an edit to the doc fails here with the reason, not in the check.
  it("is decided only through the quoted label in docs/data-sources.md", () => {
    const sources = readFileSync(join(realRepoRoot, "docs", "data-sources.md"), "utf8");
    expect(sources, 'docs/data-sources.md must keep a sentence that quotes "Market Data Provider": planned/part-02 (never edited, Part 6 compares it with reality) depends on it').toContain('"Market Data Provider"');

    const entries = loadAdlDocument(realRepoRoot).entries;
    expect(checkModelCurrency(realRepoRoot, entries).filter((v) => v.where.endsWith("planned/part-02.architecture.json"))).toEqual([]);
  });

  it("would fail, naming the planned file, if that sentence were edited away", () => {
    const root = copyFixture("model-currency-good");
    const doc = readJsonFile<Doc>(root, PLANNED);
    doc.nodes.push({ "unique-id": "old-provider", "node-type": "external-system", name: "Unmentioned Placeholder" });
    writeJsonFile(root, PLANNED, doc);
    const [violation] = checkModelCurrency(root, entriesOf(root));
    expect(violation!.where).toBe(PLANNED);
  });
});

describe("model currency: the real repo", () => {
  it("has no undecided external system, no unlinked ADR, and every component mapped", () => {
    expect(checkModelCurrency(realRepoRoot, loadAdlDocument(realRepoRoot).entries)).toEqual([]);
  });

  it("points the Part 2 entry at the built moment, and keeps the prediction it replaced readable", () => {
    const timeline = readJsonFile<Timeline>(realRepoRoot, TIMELINE);
    const part2 = timeline.moments.find((m) => m["unique-id"] === "part-02");
    expect(part2?.details?.["detailed-architecture"]).toBe("moments/part-02.architecture.json");
    expect(JSON.stringify(part2)).toContain("planned/part-02.architecture.json");
  });
});
