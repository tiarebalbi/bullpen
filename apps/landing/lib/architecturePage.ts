import type { ArchPartData } from "@bullpen/ui";
import type { CalmControl, CalmDocView, CalmNodeView } from "./calm.js";
import { ruleOutcome, type RulesSnapshot } from "./rulesSnapshot.js";

// The check that enforces a control is named in the CALM moment by file; the
// snapshot names checks by their display name. A test keeps this table and
// the moments in step, so a control can never point at a check that has no
// result to show.
export const CHECK_NAME_BY_FILE: Record<string, string> = {
  "architecture/fitness/src/boundaries-check.ts": "turbo boundaries",
  "architecture/fitness/src/imports-check.ts": "entry-point imports",
  "architecture/fitness/src/secret-check.ts": "secret containment",
  "architecture/fitness/src/budget-check.ts": "budget",
  "architecture/fitness/src/explorer-consistency-check.ts": "explorer consistency",
};

const SECRET_RULE = /^ONLY (\S+) READS (\S+)$/;

export interface ServiceRule {
  name: string;
  check: string;
  /** null when the snapshot has no result for this check, so no claim is made. */
  passed: boolean | null;
}

export interface ServiceInterface {
  direction: "in" | "out";
  peer: string;
  how: string;
  mode: "sync" | "async" | null;
}

export interface ServiceView {
  id: string;
  name: string;
  kind: "app" | "service";
  runtime: string;
  purpose: string;
  path: string | null;
  owns: string[];
  interfaces: ServiceInterface[];
  rules: ServiceRule[];
  adrs: string[];
}

export interface PlannedServiceView {
  id: string;
  name: string;
  runtime: string;
  purpose: string;
  arrives: number;
}

export interface ServicesView {
  built: ServiceView[];
  planned: PlannedServiceView[];
}

export interface FlowLane {
  id: string;
  label: string;
  meta: string;
}

export interface FlowStepView {
  n: number;
  caption: string;
  detail: string;
  from: string;
  to: string;
  mode: "sync" | "async";
}

export interface FlowView {
  name: string;
  planned: boolean;
  lanes: FlowLane[];
  steps: FlowStepView[];
}

export interface DatabaseView {
  id: string;
  label: string;
  meta: string;
  purpose: string;
  ownerLabel: string | null;
}

export interface DataView {
  reached: boolean;
  planned: boolean;
  databases: DatabaseView[];
}

export interface ScrubberPart {
  part: number;
  title: string;
  status: "built" | "planned";
}

export interface ArchitecturePageData {
  initialPart: number;
  scrubber: ScrubberPart[];
  services: Record<number, ServicesView>;
  flows: Record<number, FlowView>;
  data: Record<number, DataView>;
}

export interface ArchitecturePageInput {
  parts: ArchPartData[];
  series: Array<{ part: number; title: string }>;
  calm: Map<number, CalmDocView>;
  adlRules: string[];
  snapshot: RulesSnapshot | null;
  currentPart: number;
}

function controlRules(controls: CalmControl[], snapshot: RulesSnapshot | null): ServiceRule[] {
  const rules: ServiceRule[] = [];
  for (const control of controls) {
    for (const requirement of control.requirements) {
      if (!requirement.enforcedBy) continue;
      const check = CHECK_NAME_BY_FILE[requirement.enforcedBy];
      if (!check) continue;
      if (rules.some((r) => r.name === requirement.name && r.check === check)) continue;
      rules.push({ name: requirement.name, check, passed: ruleOutcome(snapshot, check) });
    }
  }
  return rules;
}

function buildService(node: CalmNodeView, doc: CalmDocView, content: ArchPartData, adlRules: string[], snapshot: RulesSnapshot | null): ServiceView {
  const nameOf = (id: string): string => doc.nodes.find((n) => n.id === id)?.name ?? id;
  const contentNode = content.nodes.find((n) => n.id === node.id);

  const owns: string[] = [];
  if (node.path) owns.push(`The code in ${node.path}`);
  if (node.libraries.length > 0) owns.push(`Ships ${node.libraries.join(" and ")}`);
  for (const rule of adlRules) {
    const secret = SECRET_RULE.exec(rule);
    if (secret && node.path && secret[1] === node.path) owns.push(`The only code that reads ${secret[2]}`);
  }

  const interfaces: ServiceInterface[] = [];
  const controls: CalmControl[] = [...node.controls];
  for (const rel of doc.relationships) {
    if (rel.kind === "interacts" && rel.nodes?.includes(node.id)) {
      interfaces.push({ direction: "in", peer: nameOf(rel.actor ?? ""), how: rel.description, mode: null });
    } else if (rel.kind === "connects") {
      const mode = rel.interaction === "synchronous" ? "sync" : rel.interaction === "asynchronous" ? "async" : null;
      const how = [rel.protocol, rel.interaction].filter(Boolean).join(", ") || rel.description;
      if (rel.source === node.id) {
        interfaces.push({ direction: "out", peer: nameOf(rel.destination ?? ""), how, mode });
        controls.push(...rel.controls);
      } else if (rel.destination === node.id) {
        interfaces.push({ direction: "in", peer: nameOf(rel.source ?? ""), how, mode });
      }
    }
  }

  return {
    id: node.id,
    name: node.name,
    kind: node.type === "webclient" ? "app" : "service",
    runtime: contentNode?.meta ?? "",
    purpose: contentNode?.purpose ?? node.description,
    path: node.path ?? null,
    owns,
    interfaces,
    rules: controlRules(controls, snapshot),
    adrs: contentNode?.adrs ?? [],
  };
}

/** The latest part that was actually built (has a real moment) at or before `part`. */
function builtPartFor(part: number, calm: Map<number, CalmDocView>): number {
  for (let p = part; p >= 1; p--) if (calm.get(p)?.origin === "moments") return p;
  return 1;
}

function buildServices(part: number, input: ArchitecturePageInput): ServicesView {
  const builtPart = builtPartFor(part, input.calm);
  const doc = input.calm.get(builtPart);
  const content = input.parts.find((p) => p.part === builtPart);
  if (!doc || !content) return { built: [], planned: [] };

  const built = doc.nodes
    .filter((node) => node.type === "webclient" || node.type === "service")
    .map((node) => buildService(node, doc, content, input.adlRules, input.snapshot));

  const builtIds = new Set(doc.nodes.map((n) => n.id));
  const selected = input.parts.find((p) => p.part === part);
  const planned: PlannedServiceView[] =
    selected && selected.status === "planned"
      ? selected.nodes
          .filter((n) => (n.kind === "app" || n.kind === "service") && !builtIds.has(n.id))
          .map((n) => ({
            id: n.id,
            name: n.label,
            runtime: n.meta,
            purpose: n.purpose,
            arrives: Math.min(...input.parts.filter((p) => p.nodes.some((x) => x.id === n.id)).map((p) => p.part)),
          }))
      : [];
  return { built, planned };
}

function buildFlow(content: ArchPartData, doc: CalmDocView | undefined): FlowView {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const edgeById = new Map(content.edges.map((e) => [e.id, e]));
  const raw: Array<Omit<FlowStepView, "n">> = [];

  // The request starts where an actor opens the app the first step leaves from.
  const firstEdge = content.request.steps[0] ? edgeById.get(content.request.steps[0].edge) : undefined;
  const opening = firstEdge ? content.edges.find((e) => nodeById.get(e.a)?.kind === "actor" && e.b === firstEdge.a) : undefined;
  if (opening) {
    const actor = nodeById.get(opening.a)!;
    const app = nodeById.get(opening.b)!;
    const description = doc?.relationships.find((r) => r.id === opening.id)?.description;
    raw.push({ caption: `Open ${app.label}`, detail: description ?? `${actor.label} opens ${app.label}.`, from: actor.id, to: app.id, mode: opening.type });
  }
  for (const step of content.request.steps) {
    const edge = edgeById.get(step.edge);
    if (!edge) continue;
    raw.push({ caption: step.caption, detail: step.detail, from: step.reverse ? edge.b : edge.a, to: step.reverse ? edge.a : edge.b, mode: edge.type });
  }

  const laneIds: string[] = [];
  for (const step of raw) for (const id of [step.from, step.to]) if (!laneIds.includes(id)) laneIds.push(id);
  return {
    name: content.request.name,
    planned: content.status === "planned",
    lanes: laneIds.map((id) => ({ id, label: nodeById.get(id)?.label ?? id, meta: nodeById.get(id)?.meta ?? "" })),
    steps: raw.map((step, index) => ({ n: index + 1, ...step })),
  };
}

function buildData(content: ArchPartData): DataView {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const databases = content.nodes
    .filter((n) => n.kind === "data")
    .map((db): DatabaseView => {
      const owner = content.edges
        .filter((e) => e.a === db.id || e.b === db.id)
        .map((e) => nodeById.get(e.a === db.id ? e.b : e.a))
        .find((n) => n?.kind === "service");
      return { id: db.id, label: db.label, meta: db.meta, purpose: db.purpose, ownerLabel: owner?.label ?? null };
    });
  return { reached: databases.length > 0, planned: content.status === "planned", databases };
}

/** Everything the architecture page shows, derived from the repo's own records, for each part. */
export function buildArchitecturePage(input: ArchitecturePageInput): ArchitecturePageData {
  const services: Record<number, ServicesView> = {};
  const flows: Record<number, FlowView> = {};
  const data: Record<number, DataView> = {};
  for (const content of input.parts) {
    services[content.part] = buildServices(content.part, input);
    flows[content.part] = buildFlow(content, input.calm.get(content.part));
    data[content.part] = buildData(content);
  }
  return {
    initialPart: input.currentPart,
    scrubber: input.parts.map((p) => ({ part: p.part, title: input.series.find((s) => s.part === p.part)?.title ?? `Part ${p.part}`, status: p.status })),
    services,
    flows,
    data,
  };
}
