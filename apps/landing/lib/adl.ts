import { existsSync, readFileSync } from "node:fs";

/**
 * The ADL as the landing page uses it. There is no parser here: the one
 * parser lives in architecture/fitness (src/adl.ts), and `adl:emit` writes
 * what it read from architecture/adl/structure.adl to
 * apps/landing/.generated/adl.json. This module only reads that JSON and
 * checks its shape, so a page is never drawn from a file the build could not
 * parse, and nothing here imports from architecture/ (an app does not).
 */

export type AdlTokenKind = "keyword" | "name" | "path" | "comment" | "text";

export interface AdlToken {
  text: string;
  kind: AdlTokenKind;
}

export type AdlLineKind = "blank" | "comment" | "header" | "define" | "assert";

export interface AdlLine {
  number: number;
  /** The line exactly as written in the file, indentation included. */
  raw: string;
  kind: AdlLineKind;
  tokens: AdlToken[];
}

export type AdlKind = "SYSTEM" | "COMPONENT" | "LIBRARY";

export interface AdlEntry {
  kind: AdlKind;
  name: string;
  path: string;
  line: number;
}

export interface AdlRule {
  /** Derived from the rule's text by the parser; the key results and "arrives in" are looked up by. */
  id: string;
  text: string;
  line: number;
  group: string;
}

export interface AdlGroup {
  heading: string;
  /** The line of the `#` heading. */
  line: number;
  ruleIds: string[];
}

export interface Adl {
  /** Repo-relative path of the file these lines were read from. */
  source: string;
  description: string;
  category: string;
  entries: AdlEntry[];
  rules: AdlRule[];
  groups: AdlGroup[];
  lines: AdlLine[];
}

const LINE_KINDS: readonly string[] = ["blank", "comment", "header", "define", "assert"];
const TOKEN_KINDS: readonly string[] = ["keyword", "name", "path", "comment", "text"];

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

function validLine(line: unknown): boolean {
  if (!isRecord(line) || typeof line.number !== "number" || typeof line.raw !== "string" || !LINE_KINDS.includes(line.kind as string)) return false;
  if (!Array.isArray(line.tokens)) return false;
  const tokens = line.tokens as unknown[];
  const joined = tokens.map((token) => (isRecord(token) && typeof token.text === "string" ? token.text : "")).join("");
  return joined === line.raw && tokens.every((token) => isRecord(token) && TOKEN_KINDS.includes(token.kind as string));
}

/** The first thing wrong with `data`, or null if it is what `adl:emit` writes. */
function firstProblem(data: Record<string, unknown>): string | null {
  if (data.schema !== 1) return `unknown schema ${JSON.stringify(data.schema)}`;
  const text = (["source", "description", "category"] as const).find((key) => typeof data[key] !== "string" || data[key] === "");
  if (text) return `missing ${text}`;
  const list = (["entries", "rules", "groups", "lines"] as const).find((key) => !Array.isArray(data[key]) || (data[key] as unknown[]).length === 0);
  if (list) return `missing ${list}`;
  if (!(data.lines as unknown[]).every(validLine)) return "a line whose tokens do not join back to it";
  return null;
}

/** Parses the JSON `adl:emit` wrote. Throws on anything else rather than drawing a rule that is not there. */
export function parseAdlJson(content: string, label: string): Adl {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (cause) {
    throw new Error(`${label}: invalid JSON (${(cause as Error).message})`, { cause });
  }
  const problem = isRecord(data) ? firstProblem(data) : "not an object";
  if (problem) throw new Error(`${label}: ${problem}. Run \`pnpm --filter @bullpen/fitness-checks run adl:emit\`.`);
  return data as unknown as Adl;
}

export function loadAdl(jsonPath: string): Adl {
  if (!existsSync(jsonPath)) {
    throw new Error(`${jsonPath} does not exist. It is generated from structure.adl: run \`pnpm --filter @bullpen/fitness-checks run adl:emit\`.`);
  }
  return parseAdlJson(readFileSync(jsonPath, "utf8"), jsonPath);
}

/** The lines of one group: its `#` heading and the ASSERT lines under it, as written. */
export function groupLines(adl: Adl, group: AdlGroup): AdlLine[] {
  const byNumber = new Map(adl.lines.map((line) => [line.number, line]));
  const rules = group.ruleIds.map((id) => adl.rules.find((rule) => rule.id === id)!);
  return [group.line, ...rules.map((rule) => rule.line)].map((number) => byNumber.get(number)!);
}
