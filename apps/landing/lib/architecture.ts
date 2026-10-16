import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { carryForward, momentChanges, momentIdOfPart, plannedNamesOf, type CalmChangeDoc, type CalmIds } from "@bullpen/contracts/architecture";
import type { ArchGroupData, ArchNodeData, ArchPartData, ArchPrediction } from "@bullpen/ui";

const VALID_KIND = new Set(["actor", "app", "service", "data", "infra", "ext"]);
const VALID_EDGE_TYPE = new Set(["sync", "async"]);
const VALID_STATUS = new Set(["built", "planned"]);
const PART_COUNT = 6;

/**
 * Parses one content/architecture/part-0N.json file. Throws a descriptive
 * error for anything malformed, rather than silently rendering a broken
 * or partial explorer -- matching this app's other loaders
 * (series.ts, adr.ts, cost.ts).
 */
export function parseArchitecturePart(content: string, sourceLabel: string): ArchPartData {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (cause) {
    throw new Error(`${sourceLabel}: invalid JSON (${(cause as Error).message})`, { cause });
  }
  if (typeof data !== "object" || data === null) {
    throw new Error(`${sourceLabel}: expected a JSON object`);
  }

  const { part, status, summary, nodes, edges, groups, request } = data as Record<string, unknown>;

  if (typeof part !== "number" || !Number.isInteger(part) || part < 1 || part > PART_COUNT) {
    throw new Error(`${sourceLabel}: invalid "part" (expected an integer 1-${PART_COUNT}, got ${JSON.stringify(part)})`);
  }
  if (typeof status !== "string" || !VALID_STATUS.has(status)) {
    throw new Error(`${sourceLabel}: invalid "status" (expected "built" or "planned", got ${JSON.stringify(status)})`);
  }
  if (typeof summary !== "string" || summary.trim().length === 0) {
    throw new Error(`${sourceLabel}: missing a non-empty "summary" string`);
  }
  if (!Array.isArray(nodes) || nodes.length === 0) {
    throw new Error(`${sourceLabel}: "nodes" must be a non-empty array`);
  }
  if (!Array.isArray(edges)) {
    throw new Error(`${sourceLabel}: "edges" must be an array`);
  }
  if (!Array.isArray(groups)) {
    throw new Error(`${sourceLabel}: "groups" must be an array`);
  }
  if (typeof request !== "object" || request === null) {
    throw new Error(`${sourceLabel}: missing a "request" object`);
  }

  const nodeIds = new Set<string>();
  for (const [index, entry] of nodes.entries()) {
    const n = entry as Record<string, unknown>;
    if (typeof n.id !== "string" || n.id.length === 0) {
      throw new Error(`${sourceLabel}: node ${index} is missing a non-empty "id"`);
    }
    if (nodeIds.has(n.id)) {
      throw new Error(`${sourceLabel}: duplicate node id "${n.id}"`);
    }
    nodeIds.add(n.id);
    if (typeof n.label !== "string" || n.label.length === 0) {
      throw new Error(`${sourceLabel}: node "${n.id}" is missing a non-empty "label"`);
    }
    if (typeof n.kind !== "string" || !VALID_KIND.has(n.kind)) {
      throw new Error(`${sourceLabel}: node "${n.id}" has an invalid "kind" (${JSON.stringify(n.kind)})`);
    }
    if (typeof n.purpose !== "string" || n.purpose.length === 0) {
      throw new Error(`${sourceLabel}: node "${n.id}" is missing a non-empty "purpose"`);
    }
    if (typeof n.x !== "number" || typeof n.y !== "number") {
      throw new Error(`${sourceLabel}: node "${n.id}" is missing numeric "x"/"y" positions`);
    }
  }
  checkNodeLinks(nodes as Record<string, unknown>[], nodeIds, sourceLabel);

  const edgeIds = new Set<string>();
  for (const [index, entry] of edges.entries()) {
    const e = entry as Record<string, unknown>;
    if (typeof e.id !== "string" || e.id.length === 0) {
      throw new Error(`${sourceLabel}: edge ${index} is missing a non-empty "id"`);
    }
    if (edgeIds.has(e.id)) {
      throw new Error(`${sourceLabel}: duplicate edge id "${e.id}"`);
    }
    edgeIds.add(e.id);
    if (typeof e.a !== "string" || !nodeIds.has(e.a) || typeof e.b !== "string" || !nodeIds.has(e.b)) {
      throw new Error(`${sourceLabel}: edge "${e.id}" references a node id not present in "nodes"`);
    }
    if (typeof e.type !== "string" || !VALID_EDGE_TYPE.has(e.type)) {
      throw new Error(`${sourceLabel}: edge "${e.id}" has an invalid "type" (${JSON.stringify(e.type)})`);
    }
    checkEdgeLabel(e, sourceLabel);
  }

  checkLayout(data as Record<string, unknown>, groups, nodeIds, sourceLabel);
  checkRequest(request, "request", sourceLabel, edgeIds);
  const { requests } = data as Record<string, unknown>;
  if (requests !== undefined) {
    if (!Array.isArray(requests)) throw new Error(`${sourceLabel}: "requests" must be an array`);
    requests.forEach((entry, index) => checkRequest(entry, `requests[${index}]`, sourceLabel, edgeIds));
  }

  const parsed = data as ArchPartData;
  if (parsed.groups.length === 0) {
    parsed.groups = deriveOwnershipGroups(parsed.nodes, parsed.edges);
  }
  return parsed;
}

/** A node's optional `owner` names another node in the part, and `replaces` names node ids. */
function checkNodeLinks(nodes: Record<string, unknown>[], nodeIds: Set<string>, sourceLabel: string): void {
  for (const n of nodes) {
    if (n.owner !== undefined && (typeof n.owner !== "string" || n.owner === n.id)) {
      throw new Error(`${sourceLabel}: node "${n.id}" has an invalid "owner" (a node id other than its own)`);
    }
    if (typeof n.owner === "string" && !nodeIds.has(n.owner)) {
      throw new Error(`${sourceLabel}: node "${n.id}" names an owner "${n.owner}" that is not in "nodes"`);
    }
    if (n.replaces !== undefined && (!Array.isArray(n.replaces) || n.replaces.some((id) => typeof id !== "string"))) {
      throw new Error(`${sourceLabel}: node "${n.id}" has an invalid "replaces" (expected node ids)`);
    }
  }
}

/** An edge's optional `label` (shown with the data toggle) and `caption` (always shown) are non-empty strings. */
function checkEdgeLabel(e: Record<string, unknown>, sourceLabel: string): void {
  for (const key of ["label", "caption"] as const) {
    if (e[key] !== undefined && (typeof e[key] !== "string" || e[key].length === 0)) {
      throw new Error(`${sourceLabel}: edge "${e.id}" has an empty or non-string "${key}"`);
    }
  }
  checkRate(e, sourceLabel);
}

const RATE_UNITS = new Set(["second", "minute", "hour", "day"]);
const RATE_SOURCES = new Set(["measured", "configured", "illustrative"]);

const isCount = (n: unknown): boolean => typeof n === "number" && n > 0;
const isText = (t: unknown): boolean => typeof t === "string" && t.length > 0;

/** A rate is a positive count per a unit of time, where it comes from, and a sentence saying how. */
function isRate(r: unknown): boolean {
  if (typeof r !== "object" || r === null) return false;
  const rate = r as Record<string, unknown>;
  return isCount(rate.count) && RATE_UNITS.has(String(rate.per)) && RATE_SOURCES.has(String(rate.source)) && isText(rate.basis);
}

/** An edge's optional `rate` must be one. */
function checkRate(e: Record<string, unknown>, sourceLabel: string): void {
  if (e.rate !== undefined && !isRate(e.rate)) {
    throw new Error(`${sourceLabel}: edge "${e.id}" has an invalid "rate" (a positive count, per second, minute, hour or day, a source of measured, configured or illustrative, and a basis)`);
  }
}

/** The part's optional `flow` is "down" or "right", and a group that is a node (`nodeId`) names a node of the part. */
function checkLayout(data: Record<string, unknown>, groups: unknown[], nodeIds: Set<string>, sourceLabel: string): void {
  if (data.flow !== undefined && data.flow !== "down" && data.flow !== "right") {
    throw new Error(`${sourceLabel}: "flow" must be "down" or "right"`);
  }
  for (const entry of groups) {
    const g = entry as Record<string, unknown>;
    if (g.nodeId !== undefined && (typeof g.nodeId !== "string" || !nodeIds.has(g.nodeId))) {
      throw new Error(`${sourceLabel}: group "${String(g.id)}" is a box for a node "${String(g.nodeId)}" that is not in "nodes"`);
    }
  }
}

/** A named request: a name and steps, each a caption and a detail on an edge that exists. */
function checkRequest(value: unknown, where: string, sourceLabel: string, edgeIds: Set<string>): void {
  if (typeof value !== "object" || value === null) throw new Error(`${sourceLabel}: "${where}" must be an object`);
  const req = value as Record<string, unknown>;
  if (typeof req.name !== "string" || req.name.length === 0) {
    throw new Error(`${sourceLabel}: "${where}.name" must be a non-empty string`);
  }
  if (!Array.isArray(req.steps) || req.steps.length === 0) {
    throw new Error(`${sourceLabel}: "${where}.steps" must be a non-empty array`);
  }
  for (const [index, entry] of (req.steps as unknown[]).entries()) {
    const s = entry as Record<string, unknown>;
    if (typeof s.edge !== "string" || !edgeIds.has(s.edge)) {
      throw new Error(`${sourceLabel}: ${where} step ${index} references an edge id not present in "edges"`);
    }
    if (typeof s.caption !== "string" || s.caption.length === 0) {
      throw new Error(`${sourceLabel}: ${where} step ${index} is missing a non-empty "caption"`);
    }
    if (typeof s.detail !== "string" || s.detail.length === 0) {
      throw new Error(`${sourceLabel}: ${where} step ${index} is missing a non-empty "detail"`);
    }
  }
}

/**
 * "Group by quanta" has no real source: no committed CALM model (moments
 * or planned) encodes a grouping/composed-of relationship, and the
 * design's own quanta ("market quantum", "trading quantum", ...) are
 * fictional, tied to its made-up Alpaca/Coinbase/Rust-on-Lambda system.
 * Rather than invent a grouping taxonomy, this derives the one grouping
 * signal the real per-part content already carries: a service marked
 * `db: true` (it owns a database) grouped with whichever "data"-kind
 * node it's directly wired to. A db-owning service with no such edge
 * (e.g. Ledger, which owns a database this diagram doesn't separately
 * model) simply gets no group -- honest, not padded.
 */
function deriveOwnershipGroups(nodes: ArchNodeData[], edges: ArchPartData["edges"]): ArchGroupData[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const groups: ArchGroupData[] = [];
  for (const n of nodes) {
    if (n.kind !== "service" || !n.db) continue;
    const ownedDataIds = edges
      .filter((e) => e.a === n.id || e.b === n.id)
      .map((e) => (e.a === n.id ? e.b : e.a))
      .filter((id) => byId.get(id)?.kind === "data");
    if (ownedDataIds.length === 0) continue;
    groups.push({ id: `${n.id}-owns`, label: n.label, nodeIds: [n.id, ...ownedDataIds] });
  }
  return groups;
}

/** Reads every planned CALM moment (architecture/calm/planned/*.architecture.json) for the ids they name. */
function loadPlannedCalmDocs(plannedDir: string): CalmIds[] {
  return readdirSync(plannedDir)
    .filter((file) => file.endsWith(".architecture.json"))
    .sort()
    .map((file) => JSON.parse(readFileSync(join(plannedDir, file), "utf8")) as CalmIds);
}

interface TimelineMoment {
  "unique-id": string;
  details?: { "detailed-architecture"?: string };
  adrs?: string[];
}

function readCalmDoc(calmDir: string, moment: TimelineMoment | undefined): CalmChangeDoc | undefined {
  const file = moment?.details?.["detailed-architecture"];
  return file ? (JSON.parse(readFileSync(join(calmDir, file), "utf8")) as CalmChangeDoc) : undefined;
}

const PREDICTION_TAG = "predictions-week-1";
const PREDICTION_TAG_URL = `https://github.com/tiarebalbi/bullpen/tree/${PREDICTION_TAG}`;

interface PlannedDoc {
  nodes?: Array<{ "unique-id": string; name?: string; "node-type"?: string }>;
}

/**
 * What the week-one prediction for `part` named that the built moment does not have: the planned moment's
 * nodes (actors aside) whose id is not in the built one. Derived from the two CALM documents, so it cannot
 * drift from them. Null when the part has no prediction or built everything it predicted.
 */
export function predictionOfPart(part: number, plannedDir: string, calmDir: string): ArchPrediction | null {
  const plannedFile = join(plannedDir, `part-${String(part).padStart(2, "0")}.architecture.json`);
  const builtFile = join(calmDir, "moments", `part-${String(part).padStart(2, "0")}.architecture.json`);
  if (!existsSync(plannedFile) || !existsSync(builtFile)) return null;
  const planned = JSON.parse(readFileSync(plannedFile, "utf8")) as PlannedDoc;
  const built = JSON.parse(readFileSync(builtFile, "utf8")) as PlannedDoc;
  const builtIds = new Set((built.nodes ?? []).map((n) => n["unique-id"]));
  const notBuilt = (planned.nodes ?? [])
    .filter((n) => n["node-type"] !== "actor" && !builtIds.has(n["unique-id"]))
    .map((n) => ({ id: n["unique-id"], label: n.name ?? n["unique-id"] }));
  return notBuilt.length > 0 ? { tag: PREDICTION_TAG, tagUrl: PREDICTION_TAG_URL, notBuilt } : null;
}

function changesOfPart(part: ArchPartData, previous: ArchPartData | undefined, moments: Map<string, TimelineMoment>, calmDir: string): ArchPartData {
  if (part.status !== "built" || previous?.status !== "built") return part;
  const prevMoment = moments.get(momentIdOfPart(previous.part));
  const moment = moments.get(momentIdOfPart(part.part));
  const [prevDoc, doc] = [readCalmDoc(calmDir, prevMoment), readCalmDoc(calmDir, moment)];
  if (!prevDoc || !doc) return part;
  const changes = momentChanges(prevDoc, doc, prevMoment?.adrs ?? [], moment?.adrs ?? []);
  return changes.length > 0 ? { ...part, changes } : part;
}

/**
 * Attaches to each built part what its moment added to the previous built one
 * beyond the node diff: controls on nodes and connections, and the ADRs the
 * timeline links to it; and, when the part had a week-one prediction, what that
 * prediction named and the part did not build. Read from the CALM documents the timeline
 * names, so it is derived, never written by hand. Part 1, and any part whose
 * previous moment is not built, get none.
 */
function withMomentChanges(parts: ArchPartData[], plannedDir: string, calmDir: string): ArchPartData[] {
  const timeline = JSON.parse(readFileSync(join(calmDir, "bullpen.timeline.json"), "utf8")) as { moments?: TimelineMoment[] };
  const moments = new Map((timeline.moments ?? []).map((m) => [m["unique-id"], m]));
  return parts.map((part) => {
    const withChanges = changesOfPart(part, parts.find((p) => p.part === part.part - 1), moments, calmDir);
    const prediction = part.status === "built" ? predictionOfPart(part.part, plannedDir, calmDir) : null;
    return prediction ? { ...withChanges, prediction } : withChanges;
  });
}

/**
 * Loads and parses all six content/architecture/part-0N.json files, sorted by
 * part number, then carries what is built into the planned parts that follow
 * (ADR-0011). The part files stay what they are, the week-one predictions; the
 * carry is derived here, from the built part and the ids the planned CALM
 * moments in `plannedDir` name, so nothing derived is ever committed. With
 * `calmDir` (architecture/calm) each built part also gets its derived changes.
 */
export function loadArchitectureParts(dirPath: string, plannedDir: string, calmDir?: string): ArchPartData[] {
  const parts: ArchPartData[] = [];
  for (let part = 1; part <= PART_COUNT; part++) {
    const filePath = join(dirPath, `part-${String(part).padStart(2, "0")}.json`);
    const content = readFileSync(filePath, "utf8");
    parts.push(parseArchitecturePart(content, `content/architecture/part-${String(part).padStart(2, "0")}.json`));
  }
  parts.sort((a, b) => a.part - b.part);
  const carried = carryForward(parts, plannedNamesOf(loadPlannedCalmDocs(plannedDir)));
  return calmDir ? withMomentChanges(carried, plannedDir, calmDir) : carried;
}
