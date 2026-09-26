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
  adrs?: string[];
  costNote?: string;
}

export type ArchEdgeType = "sync" | "async";

export interface ArchEdgeData {
  id: string;
  a: string;
  b: string;
  type: ArchEdgeType;
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

export interface ArchPartData {
  part: number;
  status: "built" | "planned";
  summary: string;
  nodes: ArchNodeData[];
  edges: ArchEdgeData[];
  groups: ArchGroupData[];
  request: ArchRequestData;
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
