import type { ArchPartData } from "@bullpen/ui";
import type { CalmControl, CalmDocView, CalmNodeView, CalmRelationshipView } from "./calm.js";
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
  /** The price route's cache interval, from its own code: shown on the fetch step of a built part's flow. */
  cacheSeconds: number | null;
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

/** What a service owns, from the moment (where it runs from, what it ships) and the ADL (a secret only it may read). */
function ownedThings(node: CalmNodeView, adlRules: string[]): string[] {
  const owns: string[] = [];
  if (node.path) owns.push(`The code in ${node.path}`);
  if (node.libraries.length > 0) owns.push(`Ships ${node.libraries.join(" and ")}`);
  for (const rule of adlRules) {
    const secret = SECRET_RULE.exec(rule);
    if (secret && node.path && secret[1] === node.path) owns.push(`The only code that reads ${secret[2]}`);
  }
  return owns;
}

/** The interface one relationship gives `node`, or null if it does not touch it. */
function interfaceFor(rel: CalmRelationshipView, node: CalmNodeView, nameOf: (id: string) => string): ServiceInterface | null {
  if (rel.kind === "interacts") {
    return rel.nodes?.includes(node.id) ? { direction: "in", peer: nameOf(rel.actor ?? ""), how: rel.description, mode: null } : null;
  }
  const mode = rel.interaction === "synchronous" ? "sync" : rel.interaction === "asynchronous" ? "async" : null;
  const how = [rel.protocol, rel.interaction].filter(Boolean).join(", ") || rel.description;
  if (rel.source === node.id) return { direction: "out", peer: nameOf(rel.destination ?? ""), how, mode };
  if (rel.destination === node.id) return { direction: "in", peer: nameOf(rel.source ?? ""), how, mode };
  return null;
}

/** The interfaces a service has in the moment, and the controls it carries: its own, and those on calls out of it (the budget on the call to the provider is the service's rule). */
function interfacesAndControls(node: CalmNodeView, doc: CalmDocView): { interfaces: ServiceInterface[]; controls: CalmControl[] } {
  const names = new Map(doc.nodes.map((n) => [n.id, n.name]));
  const nameOf = (id: string): string => names.get(id) ?? id;
  const interfaces = doc.relationships.map((rel) => interfaceFor(rel, node, nameOf)).filter((iface): iface is ServiceInterface => iface !== null);
  const outgoing = doc.relationships.filter((rel) => rel.kind === "connects" && rel.source === node.id);
  return { interfaces, controls: [...node.controls, ...outgoing.flatMap((rel) => rel.controls)] };
}

// metrics-gate: ignore[nesting] -- a flat record literal with no loops or nested branches; the nesting score counts its optional chaining and ternaries
function buildService(node: CalmNodeView, doc: CalmDocView, content: ArchPartData, adlRules: string[], snapshot: RulesSnapshot | null): ServiceView {
  const contentNode = content.nodes.find((n) => n.id === node.id);
  const { interfaces, controls } = interfacesAndControls(node, doc);

  return {
    id: node.id,
    name: node.name,
    kind: node.type === "webclient" ? "app" : "service",
    runtime: contentNode?.meta ?? "",
    purpose: contentNode?.purpose ?? node.description,
    path: node.path ?? null,
    owns: ownedThings(node, adlRules),
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

type RawStep = Omit<FlowStepView, "n">;

/** The request starts where an actor opens the app the first step leaves from. */
function openingStep(content: ArchPartData, doc: CalmDocView | undefined): RawStep | null {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const first = content.request.steps[0];
  const firstEdge = first ? content.edges.find((e) => e.id === first.edge) : undefined;
  if (!firstEdge) return null;
  const opening = content.edges.find((e) => nodeById.get(e.a)?.kind === "actor" && e.b === firstEdge.a);
  if (!opening) return null;

  const actor = nodeById.get(opening.a)!;
  const app = nodeById.get(opening.b)!;
  const description = doc?.relationships.find((r) => r.id === opening.id)?.description;
  return { caption: `Open ${app.label}`, detail: description ?? `${actor.label} opens ${app.label}.`, from: actor.id, to: app.id, mode: opening.type };
}

/** The part's own request steps, with the cache note on the call out to the provider of a built part. */
function requestSteps(content: ArchPartData, cacheSeconds: number | null): RawStep[] {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const steps: RawStep[] = [];
  for (const step of content.request.steps) {
    const edge = content.edges.find((e) => e.id === step.edge);
    if (!edge) continue;
    // The call out to the provider is the one the cache sits on. A planned part makes no such claim.
    const callsProvider = !step.reverse && nodeById.get(edge.b)?.kind === "ext";
    const cached = content.status === "built" && callsProvider && cacheSeconds !== null && !/cached/i.test(step.detail);
    steps.push({
      caption: step.caption,
      detail: cached ? `${step.detail} Cached for ${cacheSeconds} seconds.` : step.detail,
      from: step.reverse ? edge.b : edge.a,
      to: step.reverse ? edge.a : edge.b,
      mode: edge.type,
    });
  }
  return steps;
}

function laneFor(id: string, nodeById: Map<string, ArchPartData["nodes"][number]>): FlowLane {
  const node = nodeById.get(id);
  return { id, label: node?.label ?? id, meta: node?.meta ?? "" };
}

function buildFlow(content: ArchPartData, doc: CalmDocView | undefined, cacheSeconds: number | null): FlowView {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const opening = openingStep(content, doc);
  const raw = [...(opening ? [opening] : []), ...requestSteps(content, cacheSeconds)];

  const laneIds = [...new Set(raw.flatMap((step) => [step.from, step.to]))];
  return {
    name: content.request.name,
    planned: content.status === "planned",
    lanes: laneIds.map((id) => laneFor(id, nodeById)),
    steps: raw.map((step, index) => ({ n: index + 1, ...step })),
  };
}

/** The service a database hangs off: the service on the other end of an edge that touches it. */
function ownerLabel(db: ArchPartData["nodes"][number], content: ArchPartData): string | null {
  const nodeById = new Map(content.nodes.map((n) => [n.id, n]));
  const neighbours = content.edges.filter((e) => e.a === db.id || e.b === db.id).map((e) => nodeById.get(e.a === db.id ? e.b : e.a));
  return neighbours.find((n) => n?.kind === "service")?.label ?? null;
}

function databaseView(db: ArchPartData["nodes"][number], content: ArchPartData): DatabaseView {
  return { id: db.id, label: db.label, meta: db.meta, purpose: db.purpose, ownerLabel: ownerLabel(db, content) };
}

function buildData(content: ArchPartData): DataView {
  const databases = content.nodes.filter((n) => n.kind === "data").map((db) => databaseView(db, content));
  return { reached: databases.length > 0, planned: content.status === "planned", databases };
}

/** Everything the architecture page shows, derived from the repo's own records, for each part. */
export function buildArchitecturePage(input: ArchitecturePageInput): ArchitecturePageData {
  const services: Record<number, ServicesView> = {};
  const flows: Record<number, FlowView> = {};
  const data: Record<number, DataView> = {};
  for (const content of input.parts) {
    services[content.part] = buildServices(content.part, input);
    flows[content.part] = buildFlow(content, input.calm.get(content.part), input.cacheSeconds);
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
