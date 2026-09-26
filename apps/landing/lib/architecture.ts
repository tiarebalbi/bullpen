import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ArchGroupData, ArchNodeData, ArchPartData } from "@bullpen/ui";

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
  }

  const req = request as Record<string, unknown>;
  if (typeof req.name !== "string" || req.name.length === 0) {
    throw new Error(`${sourceLabel}: "request.name" must be a non-empty string`);
  }
  if (!Array.isArray(req.steps) || req.steps.length === 0) {
    throw new Error(`${sourceLabel}: "request.steps" must be a non-empty array`);
  }
  for (const [index, entry] of (req.steps as unknown[]).entries()) {
    const s = entry as Record<string, unknown>;
    if (typeof s.edge !== "string" || !edgeIds.has(s.edge)) {
      throw new Error(`${sourceLabel}: request step ${index} references an edge id not present in "edges"`);
    }
    if (typeof s.caption !== "string" || s.caption.length === 0) {
      throw new Error(`${sourceLabel}: request step ${index} is missing a non-empty "caption"`);
    }
    if (typeof s.detail !== "string" || s.detail.length === 0) {
      throw new Error(`${sourceLabel}: request step ${index} is missing a non-empty "detail"`);
    }
  }

  const parsed = data as ArchPartData;
  if (parsed.groups.length === 0) {
    parsed.groups = deriveOwnershipGroups(parsed.nodes, parsed.edges);
  }
  return parsed;
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

/** Loads and parses all six content/architecture/part-0N.json files, sorted by part number. */
export function loadArchitectureParts(dirPath: string): ArchPartData[] {
  const parts: ArchPartData[] = [];
  for (let part = 1; part <= PART_COUNT; part++) {
    const filePath = join(dirPath, `part-${String(part).padStart(2, "0")}.json`);
    const content = readFileSync(filePath, "utf8");
    parts.push(parseArchitecturePart(content, `content/architecture/part-${String(part).padStart(2, "0")}.json`));
  }
  return parts.sort((a, b) => a.part - b.part);
}
