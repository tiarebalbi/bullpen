import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Violation } from "./violation.js";

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

const CHECK = "explorer consistency";

/** Recorded in ADR-0006 (there is no ADL line for it: it is about the picture matching the model). */
export const EXPLORER_RULE = "every explorer node and edge exists in its CALM document, and every CALM node appears in the explorer";

const PART_COUNT = 6;

const partFile = (part: number): string => `content/architecture/part-${String(part).padStart(2, "0")}.json`;

/**
 * Cross-checks one part's explorer content (content/architecture/part-0N.json)
 * against its real CALM document: every explorer node/edge id must exist in
 * CALM, and every CALM node must appear in the explorer -- so the picture in
 * packages/ui's ArchitectureExplorer and the CALM model it's meant to
 * illustrate can't silently drift apart. Only node coverage is checked in
 * the CALM -> explorer direction: a CALM relationship without an explorer
 * edge is not flagged, since not every relationship needs a visible edge.
 * `calmPath` is the CALM file's repo-relative path, used in the fix text.
 */
export function checkExplorerConsistency(explorerData: ExplorerPartData, calmDoc: CalmDocument, calmPath = "its CALM document"): Violation[] {
  const violations: Violation[] = [];
  const where = partFile(explorerData.part);
  const base = { check: CHECK, rule: EXPLORER_RULE, where };

  const calmNodeIds = new Set(calmDoc.nodes.map((n) => n["unique-id"]));
  const calmRelIds = new Set(calmDoc.relationships.map((r) => r["unique-id"]));
  const explorerNodeIds = new Set(explorerData.nodes.map((n) => n.id));

  for (const node of explorerData.nodes) {
    if (calmNodeIds.has(node.id)) continue;
    violations.push({
      ...base,
      why: `The explorer draws node "${node.id}", which ${calmPath} does not have (ADR-0006).`,
      fix: `Remove node "${node.id}" from ${where}, or add it to ${calmPath}.`,
    });
  }
  for (const edge of explorerData.edges) {
    if (calmRelIds.has(edge.id)) continue;
    violations.push({
      ...base,
      why: `The explorer draws edge "${edge.id}", which ${calmPath} has no relationship for (ADR-0006).`,
      fix: `Remove edge "${edge.id}" from ${where}, or add a relationship with that unique-id to ${calmPath}.`,
    });
  }
  for (const calmId of calmNodeIds) {
    if (explorerNodeIds.has(calmId)) continue;
    violations.push({
      ...base,
      why: `${calmPath} has node "${calmId}", which the explorer does not draw (ADR-0006).`,
      fix: `Add node "${calmId}" (with label, kind, purpose and x/y) to ${where}, or remove it from ${calmPath}.`,
    });
  }

  return violations;
}

/**
 * The CALM document an explorer part is checked against: the part's real
 * moment once it exists, else its planned one. A part that has been built is
 * checked against what was built, not against the prediction.
 */
export function calmPathForPart(repoRoot: string, part: number): string | undefined {
  const label = String(part).padStart(2, "0");
  const candidates = [`architecture/calm/moments/part-${label}.architecture.json`, `architecture/calm/planned/part-${label}.architecture.json`];
  return candidates.find((relative) => existsSync(join(repoRoot, relative)));
}

export function checkAllExplorerParts(repoRoot: string): Violation[] {
  const violations: Violation[] = [];

  for (let part = 1; part <= PART_COUNT; part++) {
    const explorerRelative = partFile(part);
    if (!existsSync(join(repoRoot, explorerRelative))) {
      violations.push({
        check: CHECK,
        rule: EXPLORER_RULE,
        where: explorerRelative,
        why: `Part ${part} has no explorer content file (ADR-0006).`,
        fix: `Create ${explorerRelative} from the Part ${part} CALM document.`,
      });
      continue;
    }
    const calmRelative = calmPathForPart(repoRoot, part);
    if (!calmRelative) {
      violations.push({
        check: CHECK,
        rule: EXPLORER_RULE,
        where: explorerRelative,
        why: `Part ${part} has explorer content but no CALM document to check it against (ADR-0006).`,
        fix: `Add architecture/calm/moments/part-${String(part).padStart(2, "0")}.architecture.json (or a planned one), or remove ${explorerRelative}.`,
      });
      continue;
    }

    const explorerData = JSON.parse(readFileSync(join(repoRoot, explorerRelative), "utf8")) as ExplorerPartData;
    const calmDoc = JSON.parse(readFileSync(join(repoRoot, calmRelative), "utf8")) as CalmDocument;
    violations.push(...checkExplorerConsistency(explorerData, calmDoc, calmRelative));
  }

  return violations;
}
