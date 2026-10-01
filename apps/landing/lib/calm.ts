import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface CalmRequirement {
  name: string;
  description: string;
  /** Repo-relative path of the check that enforces this control, if the control names one. */
  enforcedBy?: string;
}

export interface CalmControl {
  key: string;
  description: string;
  requirements: CalmRequirement[];
}

export interface CalmNodeView {
  id: string;
  type: string;
  name: string;
  description: string;
  /** `bullpen:path`: the directory this node runs from. */
  path?: string;
  /** `bullpen:libraries`: the libraries it ships. */
  libraries: string[];
  controls: CalmControl[];
}

export interface CalmRelationshipView {
  id: string;
  kind: "interacts" | "connects";
  description: string;
  actor?: string;
  nodes?: string[];
  source?: string;
  destination?: string;
  protocol?: string;
  interaction?: string;
  controls: CalmControl[];
}

export interface CalmDocView {
  part: number;
  /** "moments" for what was built, "planned" for a prediction. */
  origin: "moments" | "planned";
  nodes: CalmNodeView[];
  relationships: CalmRelationshipView[];
}

type Json = Record<string, unknown>;
const asObject = (value: unknown): Json => (typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : {});
const asString = (value: unknown): string => (typeof value === "string" ? value : "");

function metadataOf(value: unknown): Json {
  const items = Array.isArray(value) ? value : [value];
  return Object.assign({}, ...items.map(asObject)) as Json;
}

function controlsOf(value: unknown): CalmControl[] {
  return Object.entries(asObject(value)).map(([key, control]) => {
    const body = asObject(control);
    const requirements = (Array.isArray(body.requirements) ? body.requirements : []).map((requirement) => {
      const config = asObject(asObject(requirement).config);
      const enforcedBy = asString(config["enforced-by"]);
      return {
        name: asString(config.name),
        description: asString(config.description),
        ...(enforcedBy ? { enforcedBy } : {}),
      };
    });
    return { key, description: asString(body.description), requirements };
  });
}

/** Parses one CALM architecture document down to what the architecture page shows. Throws on anything malformed. */
export function parseCalmDoc(content: string, origin: CalmDocView["origin"], label: string): CalmDocView {
  let data: Json;
  try {
    data = asObject(JSON.parse(content));
  } catch (cause) {
    throw new Error(`${label}: invalid JSON (${(cause as Error).message})`, { cause });
  }
  const part = asObject(data.metadata).part;
  if (typeof part !== "number") throw new Error(`${label}: metadata.part must be a number`);
  if (!Array.isArray(data.nodes)) throw new Error(`${label}: "nodes" must be an array`);

  const nodes = data.nodes.map((entry): CalmNodeView => {
    const node = asObject(entry);
    const meta = metadataOf(node.metadata);
    const libraries = Array.isArray(meta["bullpen:libraries"]) ? (meta["bullpen:libraries"] as unknown[]).filter((l): l is string => typeof l === "string") : [];
    return {
      id: asString(node["unique-id"]),
      type: asString(node["node-type"]),
      name: asString(node.name),
      description: asString(node.description),
      ...(typeof meta["bullpen:path"] === "string" ? { path: meta["bullpen:path"] } : {}),
      libraries,
      controls: controlsOf(node.controls),
    };
  });

  const relationships = (Array.isArray(data.relationships) ? data.relationships : []).map((entry): CalmRelationshipView => {
    const rel = asObject(entry);
    const type = asObject(rel["relationship-type"]);
    const interacts = asObject(type.interacts);
    const connects = asObject(type.connects);
    const base = {
      id: asString(rel["unique-id"]),
      description: asString(rel.description),
      controls: controlsOf(rel.controls),
    };
    if (Object.keys(interacts).length > 0) {
      return { ...base, kind: "interacts", actor: asString(interacts.actor), nodes: (Array.isArray(interacts.nodes) ? interacts.nodes : []).filter((n): n is string => typeof n === "string") };
    }
    return {
      ...base,
      kind: "connects",
      source: asString(asObject(connects.source).node),
      destination: asString(asObject(connects.destination).node),
      ...(typeof rel.protocol === "string" ? { protocol: rel.protocol } : {}),
      ...(typeof asObject(rel.metadata).interaction === "string" ? { interaction: asString(asObject(rel.metadata).interaction) } : {}),
    };
  });

  return { part, origin, nodes, relationships };
}

/** Every part's CALM document, keyed by part: the built moment where one exists, else the planned prediction. */
export function loadCalmDocs(repoRoot: string): Map<number, CalmDocView> {
  const docs = new Map<number, CalmDocView>();
  for (let part = 1; part <= 6; part++) {
    const name = `part-${String(part).padStart(2, "0")}.architecture.json`;
    for (const origin of ["moments", "planned"] as const) {
      const relative = `architecture/calm/${origin}/${name}`;
      if (!existsSync(join(repoRoot, relative))) continue;
      docs.set(part, parseCalmDoc(readFileSync(join(repoRoot, relative), "utf8"), origin, relative));
      break;
    }
  }
  return docs;
}
