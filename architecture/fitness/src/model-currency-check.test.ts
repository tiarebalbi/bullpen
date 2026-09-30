import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlFile } from "./parse-adl.js";
import { ADR_LINKED_RULE, EXTERNAL_SYSTEM_RULE, checkModelCurrency } from "./model-currency-check.js";
import { ADL_RULE } from "./rules.js";
import { copyFixture, expectFailureFormat, fixturesRoot, readJsonFile, realRepoRoot, writeJsonFile } from "./test-helpers.js";

const GOOD = join(fixturesRoot, "model-currency-good");
const entriesOf = (root: string) => parseAdlFile(join(root, "architecture", "adl", "structure.adl"));

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
    expect(violation!.why).toContain("no ADR Decision");
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
    expectFailureFormat(checkModelCurrency(rejected, entriesOf(rejected))[0]!, "model currency");
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
    expectFailureFormat(checkModelCurrency(root, entriesOf(root))[0]!, "model currency");
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

  it("follows current-moment: moving it to a moment without the mapping fails, adding the mapping passes", () => {
    const root = copyFixture("model-currency-good");
    const timeline = readJsonFile<Timeline>(root, TIMELINE);
    timeline["current-moment"] = "part-02";
    writeJsonFile(root, TIMELINE, timeline);
    expect(checkModelCurrency(root, entriesOf(root)).map((v) => v.rule)).toContain(ADL_RULE.componentsMapped);

    const planned = readJsonFile<Doc>(root, PLANNED);
    (planned.nodes[0] as { metadata?: unknown }).metadata = { "bullpen:path": "apps/web", "bullpen:libraries": ["packages/kit"] };
    (planned.nodes[1] as { metadata?: unknown }).metadata = { "bullpen:path": "apps/web/app/api/quote" };
    writeJsonFile(root, PLANNED, planned);
    expect(checkModelCurrency(root, entriesOf(root))).toEqual([]);
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

describe("model currency: the real repo", () => {
  it("has no undecided external system, no unlinked ADR, and every component mapped", () => {
    expect(checkModelCurrency(realRepoRoot, parseAdlFile(join(realRepoRoot, "architecture", "adl", "structure.adl")))).toEqual([]);
  });
});
