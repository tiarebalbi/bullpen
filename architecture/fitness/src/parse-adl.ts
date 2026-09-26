import { readFileSync } from "node:fs";

export type AdlKind = "SYSTEM" | "COMPONENT" | "LIBRARY";

export interface AdlEntry {
  kind: AdlKind;
  name: string;
  path: string;
}

// Matches lines like:
//   DEFINE SYSTEM Bullpen AS bullpen
//   DEFINE COMPONENT Trading App AS apps/web
// The name can contain spaces, so the split on " AS " must be greedy
// (anchored to the LAST occurrence) rather than the first.
const DEFINE_LINE = /^DEFINE\s+(SYSTEM|COMPONENT|LIBRARY)\s+(.+)\s+AS\s+(\S+)$/;

/**
 * Parses the contents of a `.adl` file into a structured list of
 * DEFINE SYSTEM | COMPONENT | LIBRARY declarations.
 *
 * Lines that aren't a DEFINE declaration (TYPE, DESCRIPTION, ASSERT, blank
 * lines, comments, ...) are ignored.
 */
export function parseAdl(content: string): AdlEntry[] {
  const entries: AdlEntry[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    const match = DEFINE_LINE.exec(line);
    if (!match) continue;

    const [, kind, name, path] = match;
    entries.push({
      kind: kind as AdlKind,
      name: name!.trim(),
      path: path!.trim(),
    });
  }

  return entries;
}

/** Reads a `.adl` file from disk and parses it. */
export function parseAdlFile(filePath: string): AdlEntry[] {
  const content = readFileSync(filePath, "utf8");
  return parseAdl(content);
}
