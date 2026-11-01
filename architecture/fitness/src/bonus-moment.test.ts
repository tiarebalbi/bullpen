import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseAdlDocument } from "./adl.js";
import { checkAllExplorerParts } from "./explorer-consistency-check.js";
import { latestBuiltMoment } from "./model-currency-check.js";
import { copyFixture, readJsonFile, writeJsonFile } from "./test-helpers.js";

interface Timeline {
  "current-moment": string;
  moments: Array<Record<string, unknown>>;
}
const TIMELINE = "architecture/calm/bullpen.timeline.json";

/** The explorer-carry-ok fixture (parts 1 built, 2 planned) with a bonus moment after Part 1, its CALM document and its explorer content. */
function withBonus(options: { status?: string; current?: string; skipContent?: boolean; dropNode?: boolean } = {}): string {
  const root = copyFixture("explorer-carry-ok");
  const timeline = readJsonFile<Timeline>(root, TIMELINE);
  timeline.moments.splice(1, 0, {
    "unique-id": "bonus-one",
    "node-type": "moment",
    details: { "detailed-architecture": "moments/bonus-one.architecture.json" },
    metadata: { kind: "bonus", after: "part-01", before: "part-02" },
  });
  if (options.current) timeline["current-moment"] = options.current;
  writeJsonFile(root, TIMELINE, timeline);
  writeJsonFile(root, "architecture/calm/moments/bonus-one.architecture.json", {
    nodes: [{ "unique-id": "app" }, { "unique-id": "tool" }, { "unique-id": "gateway" }],
    relationships: [{ "unique-id": "app-to-tool" }, { "unique-id": "app-to-gateway" }],
  });
  mkdirSync(join(root, "content/architecture"), { recursive: true });
  if (!options.skipContent) {
    writeJsonFile(root, "content/architecture/bonus-one.json", {
      kind: "bonus",
      after: 1,
      status: options.status ?? "planned",
      nodes: [
        { id: "app", x: 40, y: 40 },
        { id: "tool", x: 40, y: 400 },
        ...(options.dropNode ? [] : [{ id: "gateway", x: 400, y: 40 }]),
      ],
      edges: [
        { id: "app-to-tool", a: "app", b: "tool" },
        { id: "app-to-gateway", a: "app", b: "gateway" },
      ],
    });
  }
  return root;
}

describe("a bonus moment in the explorer consistency check", () => {
  it("passes when the bonus has its own CALM document and content, and is planned until the part it follows is passed", () => {
    expect(checkAllExplorerParts(withBonus())).toEqual([]);
  });

  it("expects 'built' once current-moment is the bonus itself", () => {
    const planned = checkAllExplorerParts(withBonus({ current: "bonus-one" }));
    expect(planned.map((v) => v.why)).toEqual([expect.stringContaining('says status "planned", but the timeline makes the bonus built')]);
    expect(checkAllExplorerParts(withBonus({ current: "bonus-one", status: "built" }))).toEqual([]);
  });

  it("fails a bonus whose explorer content is missing, naming the file", () => {
    const [violation] = checkAllExplorerParts(withBonus({ skipContent: true }));
    expect(violation).toMatchObject({ where: "content/architecture/bonus-one.json", why: expect.stringContaining("has no explorer content file") });
  });

  it("fails a CALM node the bonus content does not draw, naming the content file", () => {
    const [violation] = checkAllExplorerParts(withBonus({ dropNode: true }));
    expect(violation!.where).toBe("content/architecture/bonus-one.json");
    expect(violation!.why).toContain('has node "gateway", which the explorer does not draw');
  });
});

describe("the latest built moment with a bonus", () => {
  it("places a bonus after the part it follows and before the next part", () => {
    const root = withBonus();
    expect(latestBuiltMoment(root)).toEqual({ momentId: "bonus-one", file: "architecture/calm/moments/bonus-one.architecture.json" });
  });

  it("is the part itself when it has a part-0N file later than the bonus", () => {
    const root = withBonus();
    writeJsonFile(root, "architecture/calm/moments/part-02.architecture.json", { nodes: [], relationships: [] });
    expect(latestBuiltMoment(root)?.momentId).toBe("part-02");
  });
});

describe("the NO ... IMPORTS form", () => {
  const header = "DESCRIPTION d\nCATEGORY c\nDEFINE SYSTEM S AS s\n\n# Imports\n";
  it("is read by its shape: directories, then a target", () => {
    const [rule] = parseAdlDocument(`${header}ASSERT(NO apps/a, packages/b IMPORTS apps/c/lib)`).rules;
    expect(rule!.form).toEqual({ form: "no-import", directories: ["apps/a", "packages/b"], target: "apps/c/lib" });
  });
});
