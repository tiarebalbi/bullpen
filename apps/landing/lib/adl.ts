import { readFileSync } from "node:fs";

export type AdlKind = "SYSTEM" | "COMPONENT" | "LIBRARY";

export interface AdlEntry {
  kind: AdlKind;
  name: string;
  path: string;
}

export interface Adl {
  type: string;
  description: string;
  entries: AdlEntry[];
  /** Raw text inside each `ASSERT(...)` line — the structural rules. */
  rules: string[];
}

// Matches lines like:
//   DEFINE SYSTEM Bullpen AS bullpen
//   DEFINE COMPONENT Trading App AS apps/web
// The name can contain spaces, so the split on " AS " is greedy (anchored
// to the end of the line) rather than the first occurrence.
const DEFINE_LINE = /^DEFINE\s+(SYSTEM|COMPONENT|LIBRARY)\s+(.+)\s+AS\s+(\S+)$/;
const ASSERT_LINE = /^ASSERT\((.+)\)$/;
const TYPE_LINE = /^TYPE\s+(.+)$/;
const DESCRIPTION_LINE = /^DESCRIPTION\s+(.+)$/;

/**
 * A small, local re-implementation of the DEFINE/ASSERT line parsing in
 * architecture/fitness/src/parse-adl.ts. Duplicated on purpose rather than
 * imported: apps/landing is an app (per architecture/adl/structure.adl) and
 * architecture/fitness is a sibling workspace package outside apps/ and
 * packages/, so importing its source here would be exactly the kind of
 * undeclared cross-boundary dependency `turbo boundaries` and the ADL rules
 * exist to catch (see ADR-0003). This parser only needs ~20 lines, so
 * re-implementing it locally is cheaper than restructuring package
 * boundaries for one consumer.
 */
export function parseAdl(content: string): Adl {
  const entries: AdlEntry[] = [];
  const rules: string[] = [];
  let type = "";
  let description = "";

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const defineMatch = DEFINE_LINE.exec(line);
    if (defineMatch) {
      const [, kind, name, path] = defineMatch;
      entries.push({ kind: kind as AdlKind, name: name!.trim(), path: path!.trim() });
      continue;
    }

    const assertMatch = ASSERT_LINE.exec(line);
    if (assertMatch) {
      rules.push(assertMatch[1]!.trim());
      continue;
    }

    const typeMatch = TYPE_LINE.exec(line);
    if (typeMatch) {
      type = typeMatch[1]!.trim();
      continue;
    }

    const descriptionMatch = DESCRIPTION_LINE.exec(line);
    if (descriptionMatch) {
      description = descriptionMatch[1]!.trim();
    }
  }

  if (entries.length === 0) {
    throw new Error("structure.adl: no DEFINE SYSTEM/COMPONENT/LIBRARY entries found");
  }
  if (rules.length === 0) {
    throw new Error("structure.adl: no ASSERT rules found");
  }

  return { type, description, entries, rules };
}

export function loadAdl(filePath: string): Adl {
  return parseAdl(readFileSync(filePath, "utf8"));
}

export type AdlRuleToken = { text: string; keyword: boolean };

// Longest first, so "NEVER DEPEND ON" matches whole rather than leaving a
// stray "DEPEND ON" unmatched by a shorter, earlier alternative.
const ADL_KEYWORDS = ["NEVER DEPEND ON", "DEFINED", "ASSERT"] as const;
const KEYWORD_PATTERN = new RegExp(`(${ADL_KEYWORDS.join("|")})`, "g");

/**
 * Splits one real ASSERT rule's text into plain/keyword segments, so the
 * Rules card can highlight structure.adl's actual vocabulary (never a
 * fictional pseudocode-DSL) without hand-authoring markup per rule.
 */
export function tokenizeAdlRule(rule: string): AdlRuleToken[] {
  const parts = rule.split(KEYWORD_PATTERN).filter((part) => part.length > 0);
  return parts.map((text) => ({ text, keyword: (ADL_KEYWORDS as readonly string[]).includes(text) }));
}
