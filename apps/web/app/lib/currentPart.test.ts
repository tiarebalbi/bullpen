import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { currentPartTag } from "./currentPart.js";
import { emitPartTag } from "./emitPartTag.js";

const repoRoot = join(import.meta.dirname, "..", "..", "..", "..");

const timeline = (current: string) => ({
  "current-moment": current,
  moments: [{ "unique-id": "part-04" }, { "unique-id": "bonus-handles", metadata: { kind: "bonus", after: "part-04", before: "part-05" } }, { "unique-id": "part-05" }],
});

/** A repository with only this timeline in it, and the file the tag is written to. */
function emitFor(value: unknown): { tag: string | null; written: unknown } {
  const root = mkdtempSync(join(tmpdir(), "part-tag-"));
  mkdirSync(join(root, "architecture", "calm"), { recursive: true });
  writeFileSync(join(root, "architecture", "calm", "bullpen.timeline.json"), JSON.stringify(value));
  const out = join(root, "out", "part-tag.json");
  const tag = emitPartTag(root, out);
  return { tag, written: JSON.parse(readFileSync(out, "utf8")) };
}

describe("emitPartTag", () => {
  it("writes 'bonus' while the bonus moment is the current one", () => {
    expect(emitFor(timeline("bonus-handles"))).toEqual({ tag: "bonus", written: { tag: "bonus" } });
  });

  it("writes the part number again once Part 5 is the current moment", () => {
    expect(emitFor(timeline("part-05"))).toEqual({ tag: "5", written: { tag: "5" } });
    expect(emitFor(timeline("part-04"))).toEqual({ tag: "4", written: { tag: "4" } });
  });

  it("writes null, not a guess, when the timeline does not say", () => {
    expect(emitFor({}).written).toEqual({ tag: null });
  });
});

describe("currentPartTag", () => {
  it("is what the real timeline's current moment says: 'bonus', or a part number as text", () => {
    const real = JSON.parse(readFileSync(join(repoRoot, "architecture", "calm", "bullpen.timeline.json"), "utf8")) as { "current-moment": string; moments: { "unique-id": string; metadata?: { kind?: string } }[] };
    const current = real.moments.find((m) => m["unique-id"] === real["current-moment"]);
    expect(currentPartTag).toBe(current?.metadata?.kind === "bonus" ? "bonus" : String(Number(/^part-(\d+)$/.exec(real["current-moment"])![1])));
  });

  it("is built in: the module reads no file at request time", () => {
    const source = readFileSync(join(import.meta.dirname, "currentPart.ts"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(source).not.toMatch(/node:fs|readFileSync|process\.cwd/);
  });
});
