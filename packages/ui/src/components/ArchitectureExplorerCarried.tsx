import type { CSSProperties, ReactNode } from "react";
import { builtInLabel } from "../lib/builtIn.js";
import type { ArchNodeData } from "./ArchitectureExplorer.types.js";

/** ", built in Part 1" for a carried node's accessible name, nothing for any other. */
export function carriedNameSuffix(node: ArchNodeData): string {
  return node.carried && node.builtIn ? `, built in ${builtInLabel(node.builtIn)}` : "";
}

const BADGE_STYLE: CSSProperties = {
  position: "absolute",
  top: -8,
  right: 8,
  font: "700 8.5px/1 var(--font-body)",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "var(--bp-gain)",
  background: "var(--background)",
  padding: "0 4px",
};

/** The small "Built in Part N" label on a carried card, so a reader can tell built from predicted. */
export function CarriedBadge({ node }: { node: ArchNodeData }): ReactNode {
  if (!node.carried || !node.builtIn) return null;
  return <span style={BADGE_STYLE}>Built in {builtInLabel(node.builtIn)}</span>;
}

const NOTE_STYLE: CSSProperties = {
  marginTop: 8,
  alignSelf: "flex-start",
  font: "600 9.5px/1 var(--font-body)",
  letterSpacing: "0.04em",
  padding: "5px 8px",
  borderRadius: 9999,
  background: "color-mix(in oklch, var(--bp-gain) 16%, transparent)",
  color: "var(--bp-gain)",
};

/** The side panel's line for a carried node: built earlier, still running in this part's prediction. */
export function CarriedNote({ node }: { node: ArchNodeData }): ReactNode {
  if (!node.carried || !node.builtIn) return null;
  return <span style={NOTE_STYLE}>Built in {builtInLabel(node.builtIn)}; still running in this prediction.</span>;
}
