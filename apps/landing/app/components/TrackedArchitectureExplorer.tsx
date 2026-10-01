"use client";

import type { ReactNode } from "react";
import { ArchitectureExplorer, track, type ArchitectureExplorerProps } from "./ui.js";

/** The explorer, reporting each move between parts. A client component because the callback cannot cross from a server one. */
export function TrackedArchitectureExplorer(props: Omit<ArchitectureExplorerProps, "onPartMoved">): ReactNode {
  return (
    <ArchitectureExplorer
      {...props}
      onPartMoved={(from, to) => track("explorer_moment_change", { from_part: from, to_part: to })}
    />
  );
}
