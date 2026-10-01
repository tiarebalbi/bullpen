import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { carryForward, partOfMomentId, plannedNamesOf, type CarryPart } from "@bullpen/contracts/architecture";

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
 * accepted only if it is marked `carried`, names the latest built moment
 * before this part as `builtIn`, exists in that moment's CALM document and is
 * not itself named by this part's own moment (a prediction would win). A
 * carried relationship also needs both of its ends in this part.
 */
export function checkExplorerConsistency(
  explorerData: ExplorerPartData,
  calmDoc: CalmDocument,
  builtMoments: readonly BuiltMoment[] = [],
): string[] {
  const label = `content/architecture/part-${String(explorerData.part).padStart(2, "0")}.json`;
  const source = [...builtMoments].filter((m) => m.part < explorerData.part).sort((a, b) => b.part - a.part)[0];

  const ctx: PartContext = {
    part: explorerData.part,
    source,
    builtMoments,
    ownNodeIds: new Set(calmDoc.nodes.map((n) => n["unique-id"])),
    ownRelIds: new Set(calmDoc.relationships.map((r) => r["unique-id"])),
    explorerNodeIds: new Set(explorerData.nodes.map((n) => n.id)),
  };

  const violations = [
    ...explorerData.nodes.flatMap((node) => checkNode(node, ctx)),
    ...explorerData.edges.flatMap((edge) => checkEdge(edge, ctx)),
    ...[...ctx.ownNodeIds].filter((id) => !ctx.explorerNodeIds.has(id)).map((id) => `CALM node "${id}" is missing from the explorer data`),
  ];
  return violations.map((v) => `${label}: ${v}`);
}

/** What the per-item checks need to know about the part being checked. */
interface PartContext {
  part: number;
  /** The latest built moment before this part: where its carried items come from. */
  source: BuiltMoment | undefined;
  builtMoments: readonly BuiltMoment[];
  ownNodeIds: Set<string>;
  ownRelIds: Set<string>;
  explorerNodeIds: Set<string>;
}

/** Why a carried item is not acceptable, or null when it is. */
function carriedProblem(
  item: ExplorerNode | ExplorerEdge,
  kind: "node" | "edge",
  ctx: PartContext,
): string | null {
  const what = `${kind} "${item.id}"`;
  const { source } = ctx;
  if (!source) return `${what} is carried but there is no built moment before part ${ctx.part} to carry it from`;
  if (item.builtIn !== source.momentId) {
    return `${what} is carried with builtIn ${JSON.stringify(item.builtIn)}, but the latest built moment before this part is "${source.momentId}"`;
  }
  const inSource = (kind === "node" ? source.doc.nodes : source.doc.relationships).some((x) => x["unique-id"] === item.id);
  if (!inSource) return `${what} is carried but does not exist in the built moment "${source.momentId}"`;
  const named = kind === "node" ? ctx.ownNodeIds : ctx.ownRelIds;
  if (named.has(item.id)) return `${what} is carried but this part's own CALM document names it (a prediction wins, so it is not carried)`;
  return null;
}

function checkNode(node: ExplorerNode, ctx: PartContext): string[] {
  if (node.carried) return [carriedProblem(node, "node", ctx)].filter((p): p is string => p !== null);
  if (ctx.ownNodeIds.has(node.id)) return [];
  const builtIn = ctx.builtMoments.find((m) => m.doc.nodes.some((n) => n["unique-id"] === node.id));
  return [
    builtIn
      ? `node "${node.id}" does not exist in its CALM document; it is built in "${builtIn.momentId}", so it must be marked carried`
      : `node "${node.id}" does not exist in its CALM document`,
  ];
}

function checkEdge(edge: ExplorerEdge, ctx: PartContext): string[] {
  if (!edge.carried) {
    return ctx.ownRelIds.has(edge.id) ? [] : [`edge "${edge.id}" does not exist in its CALM document's relationships`];
  }
  const problems = [carriedProblem(edge, "edge", ctx)].filter((p): p is string => p !== null);
  if (!ctx.explorerNodeIds.has(edge.a ?? "") || !ctx.explorerNodeIds.has(edge.b ?? "")) {
    problems.push(`carried edge "${edge.id}" has an end that is not in this part`);
  }
  return problems;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

interface LoadedMoment {
  part: number;
  momentId: string;
  calm: CalmDocument;
  explorer: ExplorerPartData & CarryPart & { status?: string };
}

/** Reads each moment's CALM document (the one the timeline names) and its explorer part; what is missing is a violation. */
function loadMoments(repoRoot: string, timeline: CalmTimeline, calmDir: string, violations: string[]): LoadedMoment[] {
  const loaded: LoadedMoment[] = [];
  for (const moment of timeline.moments) {
    const part = partOfMomentId(moment["unique-id"]);
    if (part === null) {
      violations.push(`bullpen.timeline.json: moment "${moment["unique-id"]}" is not a part-0N id`);
      continue;
    }
    const partLabel = String(part).padStart(2, "0");
    const calmPath = join(calmDir, moment.details["detailed-architecture"]);
    const explorerPath = join(repoRoot, "content", "architecture", `part-${partLabel}.json`);
    if (!existsSync(calmPath)) {
      violations.push(`part-${partLabel}: expected CALM document not found at ${calmPath}`);
    } else if (!existsSync(explorerPath)) {
      violations.push(`content/architecture/part-${partLabel}.json: not found`);
    } else {
      loaded.push({ part, momentId: moment["unique-id"], calm: readJson(calmPath), explorer: readJson(explorerPath) });
    }
  }
  return loaded;
}

/**
 * Runs the consistency check over every moment the timeline lists. Each
 * moment's CALM document is the one the timeline names (`detailed-architecture`),
 * and the moments up to `current-moment` are the built ones. The explorer
 * parts are checked as the page renders them: with what is built carried
 * forward by the same function the landing's loader uses (ADR-0011).
 */
export function checkAllExplorerParts(repoRoot: string): string[] {
  const timelinePath = join(repoRoot, "architecture", "calm", "bullpen.timeline.json");
  if (!existsSync(timelinePath)) return [`architecture/calm/bullpen.timeline.json: not found`];
  const timeline = readJson<CalmTimeline>(timelinePath);
  const currentPart = partOfMomentId(timeline["current-moment"]);
  if (currentPart === null) return [`bullpen.timeline.json: current-moment "${timeline["current-moment"]}" is not a moment id`];

  const violations: string[] = [];
  const loaded = loadMoments(repoRoot, timeline, dirname(timelinePath), violations);

  // The carry rule reads each explorer part's status; the timeline decides what is built.
  for (const l of loaded) {
    const expected = l.part <= currentPart ? "built" : "planned";
    if (l.explorer.status !== expected) {
      violations.push(
        `content/architecture/part-${String(l.part).padStart(2, "0")}.json: status is ${JSON.stringify(l.explorer.status)}, but the timeline makes it ${expected}`,
      );
    }
  }

  const builtMoments: BuiltMoment[] = loaded.filter((l) => l.part <= currentPart).map((l) => ({ momentId: l.momentId, part: l.part, doc: l.calm }));
  const plannedNames = plannedNamesOf(loaded.filter((l) => l.part > currentPart).map((l) => l.calm));
  const resolved = carryForward(
    loaded.map((l) => l.explorer),
    plannedNames,
  );

  for (const l of loaded) {
    const explorer = resolved.find((p) => p.part === l.part)!;
    violations.push(...checkExplorerConsistency(explorer, l.calm, builtMoments));
  }

  return violations;
}
