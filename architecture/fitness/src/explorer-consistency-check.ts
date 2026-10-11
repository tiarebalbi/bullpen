import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { carryForward, partOfMomentId, plannedNamesOf, type CarryPart } from "@bullpen/contracts/architecture";
import { toRepoPath, type Violation } from "./violation.js";

export interface ExplorerNode {
  id: string;
  carried?: boolean;
  builtIn?: string;
}
export interface ExplorerEdge {
  id: string;
  a?: string;
  b?: string;
  carried?: boolean;
  builtIn?: string;
}
export interface ExplorerPartData {
  part: number;
  nodes: ExplorerNode[];
  edges: ExplorerEdge[];
}

export interface CalmNode {
  "unique-id": string;
}
export interface CalmRelationship {
  "unique-id": string;
}
export interface CalmDocument {
  nodes: CalmNode[];
  relationships: CalmRelationship[];
}

const CHECK = "explorer consistency";

/** Recorded in ADR-0006 (there is no ADL line for it: it is about the picture matching the model). */
export const EXPLORER_RULE = "every explorer node and edge exists in its CALM document, and every CALM node appears in the explorer";

const PART_COUNT = 6;

const partFile = (part: number): string => `content/architecture/part-${String(part).padStart(2, "0")}.json`;

/** One thing wrong with one part; `adr` is the decision the rule comes from. */
interface Finding {
  why: string;
  fix: string;
  adr: "ADR-0006" | "ADR-0011";
}

const violationOf = (where: string, finding: Finding): Violation => ({
  check: CHECK,
  rule: EXPLORER_RULE,
  where,
  why: `${finding.why} (${finding.adr}).`,
  fix: finding.fix,
});

/** A moment the timeline says is built, with its CALM document. */
export interface BuiltMoment {
  momentId: string;
  part: number;
  doc: CalmDocument;
}

export interface CalmTimeline {
  "current-moment": string;
  moments: Array<{ "unique-id": string; details: { "detailed-architecture": string } }>;
}

/**
 * Cross-checks one part's explorer content against its real CALM document:
 * every explorer node/edge id must exist in CALM, and every CALM node must
 * appear in the explorer -- so the picture in packages/ui's
 * ArchitectureExplorer and the CALM model it's meant to illustrate can't
 * silently drift apart. Only node coverage is checked in the CALM ->
 * explorer direction (per spec): a CALM relationship without an explorer
 * edge is not flagged, since not every relationship needs a visible edge
 * (e.g. actor "interacts" relationships already show up as "sync" edges
 * from real node ids, but this doesn't require 1:1 coverage of every
 * relationship type).
 *
 * The one exception to "must exist in its own CALM document" is a carried
 * item (ADR-0011): a built item still running in a later, planned part. It is
 * accepted only if it is marked `carried`, exists in the latest built moment
 * before this part, names the earliest built moment that contains it as
 * `builtIn` (where it was first built), and is
 * not itself named by this part's own moment (a prediction would win). A
 * carried relationship also needs both of its ends in this part.
 */
export function checkExplorerConsistency(
  explorerData: ExplorerPartData,
  calmDoc: CalmDocument,
  builtMoments: readonly BuiltMoment[] = [],
  calmPath = "its CALM document",
): Violation[] {
  const where = partFile(explorerData.part);
  const source = [...builtMoments].filter((m) => m.part < explorerData.part).sort((a, b) => b.part - a.part)[0];

  const ctx: PartContext = {
    part: explorerData.part,
    source,
    builtMoments,
    ownNodeIds: new Set(calmDoc.nodes.map((n) => n["unique-id"])),
    ownRelIds: new Set(calmDoc.relationships.map((r) => r["unique-id"])),
    explorerNodeIds: new Set(explorerData.nodes.map((n) => n.id)),
  };

  const violations: Finding[] = [
    ...explorerData.nodes.flatMap((node) => checkNode(node, ctx, where, calmPath)),
    ...explorerData.edges.flatMap((edge) => checkEdge(edge, ctx, where, calmPath)),
    ...[...ctx.ownNodeIds]
      .filter((id) => !ctx.explorerNodeIds.has(id))
      .map((id): Finding => ({
        why: `${calmPath} has node "${id}", which the explorer does not draw: it is missing from the explorer data`,
        fix: `Add node "${id}" (with label, kind, purpose and x/y) to ${where}, or remove it from ${calmPath}.`,
        adr: "ADR-0006",
      })),
  ];
  return violations.map((finding) => violationOf(where, finding));
}

/** What the per-item checks need to know about the part being checked. */
interface PartContext {
  part: number;
  /** The latest built moment before this part: where its carried items are copied from. */
  source: BuiltMoment | undefined;
  builtMoments: readonly BuiltMoment[];
  ownNodeIds: Set<string>;
  ownRelIds: Set<string>;
  explorerNodeIds: Set<string>;
}

/** The earliest built moment, before this part, whose CALM document contains the item. */
function firstBuilt(item: ExplorerNode | ExplorerEdge, kind: "node" | "edge", ctx: PartContext): BuiltMoment | undefined {
  return [...ctx.builtMoments]
    .filter((m) => m.part < ctx.part && (kind === "node" ? m.doc.nodes : m.doc.relationships).some((x) => x["unique-id"] === item.id))
    .sort((a, b) => a.part - b.part)[0];
}

/**
 * Why a carried item is not acceptable, or null when it is. Both rules hold:
 * the item exists in the latest built moment before this part (where the
 * card is copied from), and its `builtIn` is the earliest built moment that
 * contains it (where it was first built, which the label says).
 */
function carriedProblem(
  item: ExplorerNode | ExplorerEdge,
  kind: "node" | "edge",
  ctx: PartContext,
): string | null {
  const what = `${kind} "${item.id}"`;
  const { source } = ctx;
  if (!source) return `${what} is carried but there is no built moment before part ${ctx.part} to carry it from`;
  const inSource = (kind === "node" ? source.doc.nodes : source.doc.relationships).some((x) => x["unique-id"] === item.id);
  if (!inSource) return `${what} is carried but does not exist in the built moment "${source.momentId}"`;
  const first = firstBuilt(item, kind, ctx)!;
  if (item.builtIn !== first.momentId) {
    return `${what} is carried with builtIn ${JSON.stringify(item.builtIn)}, but the earliest built moment that contains it is "${first.momentId}"`;
  }
  const named = kind === "node" ? ctx.ownNodeIds : ctx.ownRelIds;
  if (named.has(item.id)) return `${what} is carried but this part's own CALM document names it (a prediction wins, so it is not carried)`;
  return null;
}

const carriedFinding = (problem: string, id: string, where: string): Finding => ({
  why: problem,
  fix: `Remove "${id}" from ${where}, or make its carried marking match the built moments (ADR-0011).`,
  adr: "ADR-0011",
});

function checkNode(node: ExplorerNode, ctx: PartContext, where: string, calmPath: string): Finding[] {
  if (node.carried) {
    const problem = carriedProblem(node, "node", ctx);
    return problem === null ? [] : [carriedFinding(problem, node.id, where)];
  }
  if (ctx.ownNodeIds.has(node.id)) return [];
  const builtIn = ctx.builtMoments.find((m) => m.doc.nodes.some((n) => n["unique-id"] === node.id));
  const draws = `The explorer draws node "${node.id}", which ${calmPath} does not have`;
  if (builtIn) {
    return [
      {
        why: `${draws}: it does not exist in its CALM document; it is built in "${builtIn.momentId}", so it must be marked carried`,
        fix: `Mark node "${node.id}" in ${where} as carried with builtIn "${builtIn.momentId}", or remove it.`,
        adr: "ADR-0011",
      },
    ];
  }
  return [
    {
      why: `${draws}: it does not exist in its CALM document`,
      fix: `Remove node "${node.id}" from ${where}, or add it to ${calmPath}.`,
      adr: "ADR-0006",
    },
  ];
}

function checkEdge(edge: ExplorerEdge, ctx: PartContext, where: string, calmPath: string): Finding[] {
  if (!edge.carried) {
    if (ctx.ownRelIds.has(edge.id)) return [];
    return [
      {
        why: `The explorer draws edge "${edge.id}", which ${calmPath} has no relationship for: it does not exist in its CALM document's relationships`,
        fix: `Remove edge "${edge.id}" from ${where}, or add a relationship with that unique-id to ${calmPath}.`,
        adr: "ADR-0006",
      },
    ];
  }
  const findings: Finding[] = [];
  const problem = carriedProblem(edge, "edge", ctx);
  if (problem !== null) findings.push(carriedFinding(problem, edge.id, where));
  if (!ctx.explorerNodeIds.has(edge.a ?? "") || !ctx.explorerNodeIds.has(edge.b ?? "")) {
    findings.push(carriedFinding(`carried edge "${edge.id}" has an end that is not in this part`, edge.id, where));
  }
  return findings;
}

const TIMELINE_PATH = "architecture/calm/bullpen.timeline.json";

const timelineViolation = (why: string, fix: string): Violation => ({
  check: CHECK,
  rule: EXPLORER_RULE,
  where: TIMELINE_PATH,
  why: `${why} (ADR-0006).`,
  fix,
});

const missingExplorerFile = (part: number): Violation => ({
  check: CHECK,
  rule: EXPLORER_RULE,
  where: partFile(part),
  why: `Part ${part} has no explorer content file (ADR-0006).`,
  fix: `Create ${partFile(part)} from the Part ${part} CALM document.`,
});

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

interface LoadedMoment {
  part: number;
  momentId: string;
  calm: CalmDocument;
  calmPath: string;
  explorer: ExplorerPartData & CarryPart & { status?: string };
}

/** Reads each moment's CALM document (the one the timeline names) and its explorer part; what is missing is a violation. */
function loadMoments(repoRoot: string, timeline: CalmTimeline, calmDir: string, violations: Violation[]): LoadedMoment[] {
  const loaded: LoadedMoment[] = [];
  for (const moment of timeline.moments) {
    const part = partOfMomentId(moment["unique-id"]);
    if (part === null) {
      violations.push(
        timelineViolation(`The timeline lists moment "${moment["unique-id"]}", which is not a part-0N id`, `Rename the moment to part-0N in ${TIMELINE_PATH}.`),
      );
      continue;
    }
    const calmPath = join(calmDir, moment.details["detailed-architecture"]);
    const calmRelative = toRepoPath(repoRoot, calmPath);
    const explorerPath = join(repoRoot, partFile(part));
    if (!existsSync(calmPath)) {
      violations.push(
        timelineViolation(
          `Part ${part}'s moment names the CALM document ${calmRelative}, which does not exist`,
          `Add ${calmRelative}, or point the moment's detailed-architecture at the right file in ${TIMELINE_PATH}.`,
        ),
      );
    } else if (!existsSync(explorerPath)) {
      violations.push(missingExplorerFile(part));
    } else {
      loaded.push({ part, momentId: moment["unique-id"], calm: readJson(calmPath), calmPath: calmRelative, explorer: readJson(explorerPath) });
    }
  }
  return loaded;
}

/** Every CALM document in architecture/calm/planned/: the predictions, which stay when a part is built. */
function loadPlannedDocs(calmDir: string): CalmDocument[] {
  const plannedDir = join(calmDir, "planned");
  if (!existsSync(plannedDir)) return [];
  return readdirSync(plannedDir)
    .filter((file) => file.endsWith(".architecture.json"))
    .sort()
    .map((file) => readJson<CalmDocument>(join(plannedDir, file)));
}

export interface ResolvedExplorer {
  /** The explorer parts as the page renders them: what is built carried into the planned parts. */
  parts: Array<ExplorerPartData & CarryPart>;
  builtMoments: BuiltMoment[];
  calmByPart: Map<number, CalmDocument>;
  /** Each part's CALM document, relative to the repo root, for the failure text. */
  calmPaths: Map<number, string>;
  violations: Violation[];
}

/**
 * Loads every moment the timeline lists and resolves the explorer parts with
 * the same carry function, and the same planned ids (every file in
 * `planned/`, as the landing's loader reads them), as the page. A part's
 * planned file stays after the part is built, so it keeps naming its ids.
 */
export function resolveExplorerParts(repoRoot: string): ResolvedExplorer {
  const violations: Violation[] = [];
  const empty = { parts: [], builtMoments: [], calmByPart: new Map<number, CalmDocument>(), calmPaths: new Map<number, string>(), violations };
  const timelinePath = join(repoRoot, "architecture", "calm", "bullpen.timeline.json");
  if (!existsSync(timelinePath)) {
    const missing = Array.from({ length: PART_COUNT }, (_, i) => i + 1).filter((part) => !existsSync(join(repoRoot, partFile(part))));
    return {
      ...empty,
      violations: [
        timelineViolation(`There is no timeline to say which CALM document each part is checked against`, `Add ${TIMELINE_PATH}.`),
        ...missing.map(missingExplorerFile),
      ],
    };
  }
  const timeline = readJson<CalmTimeline>(timelinePath);
  const currentPart = partOfMomentId(timeline["current-moment"]);
  if (currentPart === null) {
    return {
      ...empty,
      violations: [
        timelineViolation(`The timeline's current-moment "${timeline["current-moment"]}" is not a moment id`, `Set current-moment to a part-0N moment id in ${TIMELINE_PATH}.`),
      ],
    };
  }

  const calmDir = dirname(timelinePath);
  const loaded = loadMoments(repoRoot, timeline, calmDir, violations);

  // The carry rule reads each explorer part's status; the timeline decides what is built.
  for (const l of loaded) {
    const expected = l.part <= currentPart ? "built" : "planned";
    if (l.explorer.status !== expected) {
      violations.push({
        check: CHECK,
        rule: EXPLORER_RULE,
        where: partFile(l.part),
        why: `The explorer content says status ${JSON.stringify(l.explorer.status)}, but the timeline makes Part ${l.part} ${expected} (ADR-0011).`,
        fix: `Set "status" to "${expected}" in ${partFile(l.part)}, or move current-moment in ${TIMELINE_PATH}.`,
      });
    }
  }

  return {
    parts: carryForward(loaded.map((l) => l.explorer), plannedNamesOf(loadPlannedDocs(calmDir))),
    builtMoments: loaded.filter((l) => l.part <= currentPart).map((l) => ({ momentId: l.momentId, part: l.part, doc: l.calm })),
    calmByPart: new Map(loaded.map((l) => [l.part, l.calm])),
    calmPaths: new Map(loaded.map((l) => [l.part, l.calmPath])),
    violations,
  };
}

/**
 * Runs the consistency check over every moment the timeline lists. Each
 * moment's CALM document is the one the timeline names (`detailed-architecture`),
 * and the moments up to `current-moment` are the built ones. The explorer
 * parts are checked as the page renders them: with what is built carried
 * forward by the same function the landing's loader uses (ADR-0011).
 */
export function checkAllExplorerParts(repoRoot: string): Violation[] {
  const { parts, builtMoments, calmByPart, calmPaths, violations } = resolveExplorerParts(repoRoot);
  for (const explorer of parts) {
    violations.push(...checkExplorerConsistency(explorer, calmByPart.get(explorer.part)!, builtMoments, calmPaths.get(explorer.part)));
  }
  return violations;
}
