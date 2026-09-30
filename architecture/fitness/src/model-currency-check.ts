import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AdlEntry } from "./parse-adl.js";
import { ADL_RULE, citeAdl } from "./rules.js";
import type { Violation } from "./violation.js";

const CHECK = "model currency";
const TIMELINE = "architecture/calm/bullpen.timeline.json";
const DATA_SOURCES = "docs/data-sources.md";

/** Recorded in ADR-0009 (there is no ADL line for it: it is about the model matching the decisions). */
export const EXTERNAL_SYSTEM_RULE =
  "every external system in a CALM moment is decided in an ADR Decision or listed as in use or proposed in docs/data-sources.md";
export const ADR_LINKED_RULE = "every ADR is linked from the timeline moment of its part";
export const CONTROL_POINTER_RULE = "every CALM control that names the check enforcing it points at a file that exists";

interface CalmNode extends CalmControlled {
  "node-type": string;
  name?: string;
  metadata?: unknown;
}
interface CalmControlled {
  "unique-id": string;
  controls?: Record<string, { requirements?: Array<{ config?: Record<string, unknown> }> }>;
}
interface CalmDoc {
  nodes?: CalmNode[];
  relationships?: CalmControlled[];
}
interface TimelineMoment {
  "unique-id": string;
  details?: { "detailed-architecture"?: string };
  adrs?: string[];
}
interface Timeline {
  "current-moment"?: string;
  moments?: TimelineMoment[];
}

// ---------------------------------------------------------------------------
// What the decision records say
// ---------------------------------------------------------------------------

interface Unit {
  text: string;
  source: string;
}

/** A sentence-sized unit of prose: one bullet, or one paragraph. Negation is judged per unit. */
function unitsOf(text: string, source: string): Unit[] {
  const units: Unit[] = [];
  let current: string[] = [];
  const flush = (): void => {
    if (current.length > 0) units.push({ text: current.join(" "), source });
    current = [];
  };
  for (const line of text.split("\n")) {
    if (line.trim() === "") flush();
    else {
      if (/^\s*(?:[-*]|\d+\.)\s+/.test(line)) flush();
      current.push(line.trim());
    }
  }
  flush();
  return units;
}

function sectionsOf(markdown: string, level: "##"): Array<{ heading: string; body: string }> {
  const sections: Array<{ heading: string; body: string }> = [];
  let heading: string | null = null;
  let body: string[] = [];
  const flush = (): void => {
    if (heading !== null) sections.push({ heading, body: body.join("\n") });
  };
  for (const line of markdown.split("\n")) {
    const match = new RegExp(`^${level}\\s+(.+)$`).exec(line);
    if (match) {
      flush();
      heading = match[1]!.trim();
      body = [];
    } else body.push(line);
  }
  flush();
  return sections;
}

// A unit that says the system was turned down, or is not in use, is not a decision to use it.
const NEGATION = /\b(?:rejected|ruled out|not part of the plan|not pursued|not used|not named|declined|refused)\b/i;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, name: string): boolean => new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(name)}(?![A-Za-z0-9])`, "i").test(text);
/** `name` inside a quoted label: the docs defining a label (like a generic placeholder), not mentioning a vendor in passing. */
const quotedIn = (text: string, name: string): boolean =>
  [...text.matchAll(/["“]([^"”]+)["”]/g)].some((quoted) => mentions(quoted[1]!, name));

interface Decisions {
  /** Units that can make a system decided, tagged with how they count. */
  decided: Array<Unit & { heading: boolean }>;
  /** Units that only ever show a system was turned down. */
  turnedDown: Unit[];
  adrs: Array<{ id: string; file: string; part: number | null }>;
}

function readDecisions(repoRoot: string): Decisions {
  const decisions: Decisions = { decided: [], turnedDown: [], adrs: [] };

  const adrDir = join(repoRoot, "architecture", "adr");
  if (existsSync(adrDir)) {
    for (const file of readdirSync(adrDir).filter((name) => name.endsWith(".md")).sort()) {
      const sections = sectionsOf(readFileSync(join(adrDir, file), "utf8"), "##");
      const id = `ADR-${file.slice(0, 4)}`;
      const partText = sections.find((s) => s.heading.toLowerCase() === "part")?.body.trim();
      const part = partText && /^\d+$/.test(partText) ? Number(partText) : null;
      decisions.adrs.push({ id, file: `architecture/adr/${file}`, part });

      for (const section of sections) {
        const kind = section.heading.toLowerCase();
        if (kind === "decision") for (const unit of unitsOf(section.body, `${id} Decision`)) decisions.decided.push({ ...unit, heading: false });
        if (kind === "alternatives") decisions.turnedDown.push(...unitsOf(section.body, `${id} Alternatives`));
      }
    }
  }

  const sourcesPath = join(repoRoot, DATA_SOURCES);
  if (existsSync(sourcesPath)) {
    for (const section of sectionsOf(readFileSync(sourcesPath, "utf8"), "##")) {
      const rejected = /\brejected\b/i.test(section.heading);
      const source = `${DATA_SOURCES} (${section.heading})`;
      const units = [{ text: section.heading, source }, ...unitsOf(section.body, source)];
      if (rejected) decisions.turnedDown.push(...units);
      else units.forEach((unit, index) => decisions.decided.push({ ...unit, heading: index === 0 }));
    }
  }
  return decisions;
}

type Standing = { kind: "decided" } | { kind: "rejected"; source: string } | { kind: "unrecorded" };

/**
 * Whether `name` is decided. Counts: an ADR Decision that does not say it was
 * turned down; a provider listed under its own docs/data-sources.md heading
 * as chosen or proposed; a quoted label the decision records define (a
 * generic placeholder such as "Stock data provider"). Does not count: a
 * mention in an ADR's Alternatives, a section headed "rejected", an
 * incidental mention in prose, or a sentence that says it is not used.
 */
function standingOf(name: string, decisions: Decisions): Standing {
  const decided = decisions.decided.some((unit) => {
    if (!mentions(unit.text, name) || NEGATION.test(unit.text)) return false;
    return unit.heading || unit.source.endsWith("Decision") || quotedIn(unit.text, name);
  });
  if (decided) return { kind: "decided" };

  const evidence = [...decisions.turnedDown, ...decisions.decided.filter((unit) => NEGATION.test(unit.text))].find((unit) => mentions(unit.text, name));
  return evidence ? { kind: "rejected", source: evidence.source } : { kind: "unrecorded" };
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

function readJson<T>(repoRoot: string, relative: string): T | undefined {
  const path = join(repoRoot, relative);
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as T) : undefined;
}

function calmFiles(repoRoot: string): string[] {
  const files: string[] = [];
  for (const dir of ["moments", "planned"]) {
    const full = join(repoRoot, "architecture", "calm", dir);
    if (!existsSync(full)) continue;
    for (const name of readdirSync(full).filter((n) => n.endsWith(".json")).sort()) files.push(`architecture/calm/${dir}/${name}`);
  }
  return files;
}

function metadataOf(node: CalmNode): Record<string, unknown> {
  const raw = node.metadata;
  const objects = (Array.isArray(raw) ? raw : [raw]).filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null);
  return Object.assign({}, ...objects) as Record<string, unknown>;
}

const pathOf = (node: CalmNode): string | undefined => {
  const value = metadataOf(node)["bullpen:path"];
  return typeof value === "string" ? value : undefined;
};
const librariesOf = (node: CalmNode): string[] => {
  const value = metadataOf(node)["bullpen:libraries"];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
};

function checkExternalSystems(repoRoot: string, decisions: Decisions): Violation[] {
  const violations: Violation[] = [];
  for (const file of calmFiles(repoRoot)) {
    const doc = readJson<CalmDoc>(repoRoot, file);
    for (const node of doc?.nodes ?? []) {
      if (node["node-type"] !== "external-system" || !node.name) continue;
      const standing = standingOf(node.name, decisions);
      if (standing.kind === "decided") continue;
      const label = `Node "${node["unique-id"]}" is the external system "${node.name}"`;
      violations.push({
        check: CHECK,
        rule: EXTERNAL_SYSTEM_RULE,
        where: file,
        why:
          standing.kind === "rejected"
            ? `${label}, which ${standing.source} records only as turned down (ADR-0009).`
            : `${label}, which no ADR Decision and no entry in ${DATA_SOURCES} records as in use or proposed (ADR-0009).`,
        fix:
          standing.kind === "rejected"
            ? `Rename the node to the provider that was chosen, or write a new ADR that reverses the rejection before the model names it.`
            : `Record the decision first (an ADR Decision, or a chosen/proposed entry in ${DATA_SOURCES}), or rename the node to the provider that is decided.`,
      });
    }
  }
  return violations;
}

/** A control that says which check enforces it must name a check that is still there. */
function checkControlPointers(repoRoot: string): Violation[] {
  const violations: Violation[] = [];
  for (const file of calmFiles(repoRoot)) {
    const doc = readJson<CalmDoc>(repoRoot, file);
    for (const owner of [...(doc?.nodes ?? []), ...(doc?.relationships ?? [])]) {
      for (const [controlName, control] of Object.entries(owner.controls ?? {})) {
        for (const requirement of control.requirements ?? []) {
          const path = requirement.config?.["enforced-by"];
          if (typeof path !== "string" || existsSync(join(repoRoot, path))) continue;
          violations.push({
            check: CHECK,
            rule: CONTROL_POINTER_RULE,
            where: file,
            why: `Control "${controlName}" on "${owner["unique-id"]}" says ${path} enforces it, but that file does not exist (ADR-0009).`,
            fix: `Point "enforced-by" at the check that enforces the control, or restore ${path}.`,
          });
        }
      }
    }
  }
  return violations;
}

function checkAdrLinks(repoRoot: string, decisions: Decisions, timeline: Timeline | undefined): Violation[] {
  if (!timeline) {
    return [
      {
        check: CHECK,
        rule: ADR_LINKED_RULE,
        where: TIMELINE,
        why: `There is no timeline to link the ADRs from (ADR-0009).`,
        fix: `Restore ${TIMELINE}.`,
      },
    ];
  }
  const violations: Violation[] = [];
  const moments = timeline.moments ?? [];

  for (const adr of decisions.adrs) {
    if (adr.part === null) continue;
    const momentId = `part-${String(adr.part).padStart(2, "0")}`;
    const moment = moments.find((m) => m["unique-id"] === momentId);
    if (!moment) {
      violations.push({
        check: CHECK,
        rule: ADR_LINKED_RULE,
        where: TIMELINE,
        why: `${adr.id} belongs to Part ${adr.part}, but the timeline has no moment "${momentId}" to link it from (ADR-0009).`,
        fix: `Add a moment with unique-id "${momentId}" to ${TIMELINE}, or correct the Part in ${adr.file}.`,
      });
    } else if (!(moment.adrs ?? []).includes(adr.file)) {
      violations.push({
        check: CHECK,
        rule: ADR_LINKED_RULE,
        where: TIMELINE,
        why: `${adr.id} belongs to Part ${adr.part}, but moment ${momentId} does not link ${adr.file} (ADR-0009).`,
        fix: `Add "${adr.file}" to the adrs of moment ${momentId} in ${TIMELINE}.`,
      });
    }
  }

  for (const moment of moments) {
    for (const link of moment.adrs ?? []) {
      if (existsSync(join(repoRoot, link))) continue;
      violations.push({
        check: CHECK,
        rule: ADR_LINKED_RULE,
        where: TIMELINE,
        why: `Moment ${moment["unique-id"]} links ${link}, which does not exist (ADR-0009).`,
        fix: `Remove the link from ${TIMELINE}, or restore the ADR file.`,
      });
    }
  }
  return violations;
}

function checkAdlMapping(repoRoot: string, entries: AdlEntry[], timeline: Timeline | undefined, currentMoment: string | undefined): Violation[] {
  const momentId = currentMoment ?? timeline?.["current-moment"];
  const moment = timeline?.moments?.find((m) => m["unique-id"] === momentId);
  const detailed = moment?.details?.["detailed-architecture"];
  if (!momentId || !moment || !detailed) {
    return [
      {
        check: CHECK,
        rule: ADL_RULE.componentsMapped,
        where: TIMELINE,
        why: `The timeline's current moment "${momentId ?? "(none)"}" has no detailed architecture to map the ADL onto (${citeAdl(repoRoot, ADL_RULE.componentsMapped)}).`,
        fix: `Set "current-moment" in ${TIMELINE} to a moment that has a detailed-architecture file.`,
      },
    ];
  }

  const file = `architecture/calm/${detailed}`;
  const doc = readJson<CalmDoc>(repoRoot, file);
  if (!doc) {
    return [
      {
        check: CHECK,
        rule: ADL_RULE.componentsMapped,
        where: TIMELINE,
        why: `Moment ${momentId} points at ${file}, which does not exist (${citeAdl(repoRoot, ADL_RULE.componentsMapped)}).`,
        fix: `Restore ${file}, or correct the moment's detailed-architecture.`,
      },
    ];
  }

  const nodes = doc.nodes ?? [];
  const violations: Violation[] = [];
  const defined = entries.filter((entry) => entry.kind === "COMPONENT" || entry.kind === "LIBRARY");

  for (const entry of defined) {
    const mapped = nodes.some((node) => pathOf(node) === entry.path || (entry.kind === "LIBRARY" && librariesOf(node).includes(entry.path)));
    if (mapped) continue;
    const cite = citeAdl(repoRoot, ADL_RULE.componentsMapped);
    violations.push({
      check: CHECK,
      rule: ADL_RULE.componentsMapped,
      where: file,
      why:
        entry.kind === "LIBRARY"
          ? `ADL library "${entry.name}" (${entry.path}) maps to no node in moment ${momentId}: no node lists it under bullpen:libraries (${cite}).`
          : `ADL component "${entry.name}" (${entry.path}) maps to no node in moment ${momentId}: no node has bullpen:path "${entry.path}" (${cite}).`,
      fix:
        entry.kind === "LIBRARY"
          ? `List "${entry.path}" under "bullpen:libraries" in the metadata of each node that ships it in ${file}.`
          : `Add "bullpen:path": "${entry.path}" to the metadata of the node that runs it in ${file}.`,
    });
  }

  for (const node of nodes) {
    if (node["node-type"] !== "webclient" && node["node-type"] !== "service") continue;
    const cite = citeAdl(repoRoot, ADL_RULE.nodesMapped);
    const path = pathOf(node);
    if (!path) {
      violations.push({
        check: CHECK,
        rule: ADL_RULE.nodesMapped,
        where: file,
        why: `Node "${node["unique-id"]}" (${node["node-type"]}) in moment ${momentId} has no bullpen:path, so nothing ties it to an ADL entry (${cite}).`,
        fix: `Add "bullpen:path" to its metadata in ${file}, pointing at the ADL component it runs from.`,
      });
    } else if (!defined.some((entry) => path === entry.path || path.startsWith(`${entry.path}/`))) {
      violations.push({
        check: CHECK,
        rule: ADL_RULE.nodesMapped,
        where: file,
        why: `Node "${node["unique-id"]}" maps to ${path}, which no ADL component or library covers (${cite}).`,
        fix: `DEFINE a component or library for ${path} in architecture/adl/structure.adl, or correct the node's bullpen:path.`,
      });
    }
  }
  return violations;
}

/**
 * The drift check. In week 1 the planned CALM model still named providers
 * that had been decided against, and an agent followed the model. The model
 * is not allowed to say anything the records do not: its external systems
 * must be decided, every ADR must be linked from its part's moment, and the
 * ADL and the current moment must describe the same components.
 *
 * `currentMoment` overrides the timeline's own `current-moment`, so the
 * tests can ask "would this still hold if Part 2 were current?".
 */
export function checkModelCurrency(repoRoot: string, entries: AdlEntry[], options: { currentMoment?: string } = {}): Violation[] {
  const decisions = readDecisions(repoRoot);
  const timeline = readJson<Timeline>(repoRoot, TIMELINE);
  return [
    ...checkExternalSystems(repoRoot, decisions),
    ...checkControlPointers(repoRoot),
    ...checkAdrLinks(repoRoot, decisions, timeline),
    ...checkAdlMapping(repoRoot, entries, timeline, options.currentMoment),
  ];
}
