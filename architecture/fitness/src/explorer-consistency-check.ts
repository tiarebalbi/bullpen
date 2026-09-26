import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface ExplorerNode {
  id: string;
}
export interface ExplorerEdge {
  id: string;
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

/**
 * Cross-checks one part's explorer content (content/architecture/part-0N.json)
 * against its real CALM document (the moment for Part 1, the planned moment
 * for Parts 2-6): every explorer node/edge id must exist in CALM, and every
 * CALM node must appear in the explorer -- so the picture in
 * packages/ui's ArchitectureExplorer and the CALM model it's meant to
 * illustrate can't silently drift apart. Only node coverage is checked in
 * the CALM -> explorer direction (per spec): a CALM relationship without an
 * explorer edge is not flagged, since not every relationship needs a
 * visible edge (e.g. actor "interacts" relationships already show up as
 * "sync" edges from real node ids, but this doesn't require 1:1 coverage
 * of every relationship type).
 */
export function checkExplorerConsistency(explorerData: ExplorerPartData, calmDoc: CalmDocument): string[] {
  const violations: string[] = [];
  const label = `content/architecture/part-${String(explorerData.part).padStart(2, "0")}.json`;

  const calmNodeIds = new Set(calmDoc.nodes.map((n) => n["unique-id"]));
  const calmRelIds = new Set(calmDoc.relationships.map((r) => r["unique-id"]));
  const explorerNodeIds = new Set(explorerData.nodes.map((n) => n.id));

  for (const node of explorerData.nodes) {
    if (!calmNodeIds.has(node.id)) {
      violations.push(`${label}: node "${node.id}" does not exist in its CALM document`);
    }
  }
  for (const edge of explorerData.edges) {
    if (!calmRelIds.has(edge.id)) {
      violations.push(`${label}: edge "${edge.id}" does not exist in its CALM document's relationships`);
    }
  }
  for (const calmId of calmNodeIds) {
    if (!explorerNodeIds.has(calmId)) {
      violations.push(`${label}: CALM node "${calmId}" is missing from the explorer data`);
    }
  }

  return violations;
}

const PART_COUNT = 6;

export function checkAllExplorerParts(repoRoot: string): string[] {
  const violations: string[] = [];

  for (let part = 1; part <= PART_COUNT; part++) {
    const partLabel = String(part).padStart(2, "0");
    const explorerPath = join(repoRoot, "content", "architecture", `part-${partLabel}.json`);
    if (!existsSync(explorerPath)) {
      violations.push(`content/architecture/part-${partLabel}.json: not found`);
      continue;
    }
    const calmPath =
      part === 1
        ? join(repoRoot, "architecture", "calm", "moments", "part-01.architecture.json")
        : join(repoRoot, "architecture", "calm", "planned", `part-${partLabel}.architecture.json`);
    if (!existsSync(calmPath)) {
      violations.push(`part-${partLabel}: expected CALM document not found at ${calmPath}`);
      continue;
    }

    const explorerData = JSON.parse(readFileSync(explorerPath, "utf8")) as ExplorerPartData;
    const calmDoc = JSON.parse(readFileSync(calmPath, "utf8")) as CalmDocument;
    violations.push(...checkExplorerConsistency(explorerData, calmDoc));
  }

  return violations;
}
