export type ArchNodeKind = "actor" | "app" | "service" | "data" | "infra" | "ext";

export interface ArchNodeData {
  id: string;
  label: string;
  kind: ArchNodeKind;
  meta: string;
  purpose: string;
  x: number;
  y: number;
  /** Renders a small database pill under the node when the "Data ownership" toggle is on. */
  db?: boolean;
  /** The id of the node that owns this one (a schema's owning service): the "Data ownership" toggle colours it by owner. */
  owner?: string;
  /** Ids of earlier nodes this one took over, so "What changed" says they moved here instead of calling them removed. */
  replaces?: string[];
  adrs?: string[];
  costNote?: string;
  /** Not this part's prediction but a built part's: it carried forward, still running (ADR-0011). */
  carried?: true;
  /** The moment that built a carried item, e.g. "part-01". */
  builtIn?: string;
}

export type ArchEdgeType = "sync" | "async";

export interface ArchEdgeData {
  id: string;
  a: string;
  b: string;
  type: ArchEdgeType;
  /** Written on the connection when the "Data ownership" toggle is on: the database role and what it may do. */
  label?: string;
  carried?: true;
  builtIn?: string;
}

export interface ArchGroupData {
  id: string;
  label: string;
  nodeIds: string[];
}

export interface ArchRequestStep {
  edge: string;
  caption: string;
  detail: string;
  /** True when this step highlights the edge in the b -> a direction (a response, not a request). */
  reverse?: boolean;
}

export interface ArchRequestData {
  name: string;
  steps: ArchRequestStep[];
}

/** A control the part's moment added to something the previous moment already had, as the CALM model words it. */
export interface ArchControlChange {
  key: string;
  description?: string;
}

/** What a built part added that the node diff cannot show: controls on existing nodes and connections, and its ADRs. */
export type ArchChange =
  | { kind: "controls"; target: string; nodeId?: string; controls: ArchControlChange[] }
  | { kind: "adr"; adr: string };

/** What the week-one prediction named that the part did not build, derived from its planned moment. */
export interface ArchPrediction {
  /** The tag the predictions are kept at. */
  tag: string;
  tagUrl: string;
  notBuilt: Array<{ id: string; label: string }>;
}

export interface ArchPartData {
  part: number;
  status: "built" | "planned";
  summary: string;
  nodes: ArchNodeData[];
  edges: ArchEdgeData[];
  groups: ArchGroupData[];
  request: ArchRequestData;
  /** Further requests to follow beyond `request`, such as a buy next to a price request. */
  requests?: ArchRequestData[];
  /** Derived by the loader for a built part that had a prediction; absent otherwise. */
  prediction?: ArchPrediction;
  /** Derived by the loader from the part's moment and the previous built one; absent for Part 1 and planned parts. */
  changes?: ArchChange[];
}

export interface ArchWhatChanged {
  added: string[];
  removed: string[];
  changed: string[];
}

/** Real ADR metadata for the side panel's "Decisions" list -- id, title, and a click handler. */
export interface ArchAdrRef {
  id: string;
  title: string;
}
