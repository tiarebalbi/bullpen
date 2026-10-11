import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The one ADL parser. The checks read `architecture/adl/structure.adl` through
 * it, and the landing page reads the JSON `emitAdlJson` writes from it, so a
 * rule means the same thing to the build that enforces it and to the page that
 * shows it. Nothing else in the repo parses ADL.
 *
 * The language is the one in Ford and Richards' *Architecture as Code*:
 *
 *   DESCRIPTION <text>
 *   CATEGORY <text>
 *   DEFINE SYSTEM <name> AS <path>
 *     DEFINE COMPONENT|LIBRARY <name> AS <path>     (indented under the system)
 *
 *   # <heading>
 *   ASSERT(<rule>)
 *
 * Asserts sit under the `#` heading above them. Three forms carry meaning the
 * checks use: `A IS DEPENDENT ON B, C` (an allow-list), `A HAS NO DEPENDENCY ON
 * B, C` (direct or transitive), and `ONLY <directory> READS <NAME>`.
 */

export type AdlKind = "SYSTEM" | "COMPONENT" | "LIBRARY";

export interface AdlEntry {
  kind: AdlKind;
  name: string;
  path: string;
  line: number;
}

export type AssertForm =
  | { form: "dependent-on"; subject: string; targets: string[] }
  | { form: "no-dependency-on"; subject: string; targets: string[] }
  | { form: "secret"; directory: string; secret: string }
  | { form: "free" };

export interface AdlRule {
  /** Stable across edits that leave the rule's wording alone: derived from the text, never from a position. */
  id: string;
  /** The text inside `ASSERT(...)`, exactly as written. */
  text: string;
  line: number;
  /** The `#` heading the rule sits under, without the `#`. */
  group: string;
  form: AssertForm;
}

export interface AdlGroup {
  heading: string;
  line: number;
  ruleIds: string[];
}

export type AdlTokenKind = "keyword" | "name" | "path" | "comment" | "text";

export interface AdlToken {
  text: string;
  kind: AdlTokenKind;
}

export type AdlLineKind = "blank" | "comment" | "header" | "define" | "assert";

export interface AdlSourceLine {
  number: number;
  /** The line exactly as written, indentation included. The tokens always join back to it. */
  raw: string;
  kind: AdlLineKind;
  tokens: AdlToken[];
}

export interface AdlDocument {
  description: string;
  category: string;
  entries: AdlEntry[];
  rules: AdlRule[];
  groups: AdlGroup[];
  lines: AdlSourceLine[];
}

export class AdlParseError extends Error {
  constructor(label: string, line: number, message: string) {
    super(`${label}:${line}: ${message}`);
    this.name = "AdlParseError";
  }
}

/** `Trading App AS apps/web` -> `trading-app`: how a name or an assert becomes an id, a tag, a slug. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const ruleId = slug;

const COMMENT_LINE = /^(\s*)(#.*)$/;
const HEADER_LINE = /^(DESCRIPTION|CATEGORY)\s+(\S.*)$/;
const DEFINE_LINE = /^(\s*)DEFINE\s+(SYSTEM|COMPONENT|LIBRARY)\s+(.+?)\s+AS\s+(\S+)(\s*)$/;
const ASSERT_LINE = /^ASSERT\((.+)\)(\s*)$/;
const OLD_HEADER = /^(ADL:|TYPE\s)/;
const DEPENDENCY_ASSERT = /^(.+?) (IS DEPENDENT ON|HAS NO DEPENDENCY ON) (.+)$/;
const SECRET_ASSERT = /^ONLY (\S+) READS (\S+)$/;

/** Longest phrase first, so `ONLY THROUGH` is one keyword and not `ONLY` followed by a word. */
const KEYWORDS = [
  "IS DEPENDENT ON",
  "HAS NO DEPENDENCY ON",
  "ONLY THROUGH",
  "DESCRIPTION",
  "CATEGORY",
  "COMPONENTS",
  "COMPONENT",
  "LIBRARIES",
  "LIBRARY",
  "DEFINED",
  "DEFINE",
  "SYSTEM",
  "ASSERT",
  "READS",
  "ONLY",
  "AS",
];

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

interface RawLine {
  number: number;
  raw: string;
}

interface Parsed {
  description: string;
  category: string;
  entries: AdlEntry[];
  asserts: Array<{ text: string; line: number; group: string; groupLine: number }>;
  kinds: Map<number, AdlLineKind>;
}

function classify(raw: string): AdlLineKind | "old-header" | "unknown" {
  if (raw.trim() === "") return "blank";
  if (COMMENT_LINE.test(raw)) return "comment";
  if (OLD_HEADER.test(raw)) return "old-header";
  if (HEADER_LINE.test(raw.trimStart())) return "header";
  if (DEFINE_LINE.test(raw)) return "define";
  if (ASSERT_LINE.test(raw.trimStart())) return "assert";
  return "unknown";
}

function rejectBadLine(label: string, { number, raw }: RawLine, kind: ReturnType<typeof classify>): void {
  if (/^ *\t/.test(raw)) throw new AdlParseError(label, number, "indent with spaces, not tabs");
  if (kind === "old-header") {
    throw new AdlParseError(label, number, `"${raw.trim()}" is the old header. The file starts with DESCRIPTION and CATEGORY lines.`);
  }
  if (kind === "unknown") {
    throw new AdlParseError(label, number, `cannot parse "${raw.trim()}". A line is blank, a # comment, DESCRIPTION, CATEGORY, DEFINE, or ASSERT(...).`);
  }
  if ((kind === "header" || kind === "assert") && /^\s/.test(raw)) {
    throw new AdlParseError(label, number, `${kind === "header" ? "DESCRIPTION and CATEGORY" : "ASSERT"} starts in column 0, not indented.`);
  }
}

function addEntry(parsed: Parsed, label: string, line: RawLine, match: RegExpExecArray): void {
  const [, indent, kind, name, path] = match as unknown as [string, string, AdlKind, string, string];
  const hasSystem = parsed.entries.some((entry) => entry.kind === "SYSTEM");
  if (kind === "SYSTEM") {
    if (hasSystem) throw new AdlParseError(label, line.number, "a second DEFINE SYSTEM; a file describes one system.");
    if (indent !== "") throw new AdlParseError(label, line.number, "DEFINE SYSTEM starts in column 0.");
  } else {
    if (!hasSystem) throw new AdlParseError(label, line.number, `DEFINE ${kind} comes after DEFINE SYSTEM.`);
    if (indent === "") throw new AdlParseError(label, line.number, `DEFINE ${kind} is indented under DEFINE SYSTEM.`);
  }
  parsed.entries.push({ kind, name: name.trim(), path, line: line.number });
}

function setHeader(parsed: Parsed, label: string, line: RawLine, match: RegExpExecArray): void {
  const [, key, value] = match as unknown as [string, "DESCRIPTION" | "CATEGORY", string];
  const field = key === "DESCRIPTION" ? "description" : "category";
  if (parsed[field] !== "") throw new AdlParseError(label, line.number, `a second ${key}.`);
  parsed[field] = value.trim();
}

/** Pass one: what each line is, the header, the DEFINEs, and which `#` heading every ASSERT sits under. */
function readStructure(lines: RawLine[], label: string): Parsed {
  const parsed: Parsed = { description: "", category: "", entries: [], asserts: [], kinds: new Map() };
  let heading: { text: string; line: number } | null = null;

  for (const line of lines) {
    const kind = classify(line.raw);
    rejectBadLine(label, line, kind);
    if (kind === "old-header" || kind === "unknown") continue;
    parsed.kinds.set(line.number, kind);

    if (kind === "comment" && !/^\s/.test(line.raw)) heading = { text: line.raw.slice(1).trim(), line: line.number };
    if (kind === "header") setHeader(parsed, label, line, HEADER_LINE.exec(line.raw)!);
    if (kind === "define") addEntry(parsed, label, line, DEFINE_LINE.exec(line.raw)!);
    if (kind === "assert") {
      if (!heading) throw new AdlParseError(label, line.number, "an ASSERT sits under a # heading, and there is none above it.");
      parsed.asserts.push({ text: ASSERT_LINE.exec(line.raw)![1]!.trim(), line: line.number, group: heading.text, groupLine: heading.line });
    }
  }

  if (parsed.description === "") throw new AdlParseError(label, 1, "no DESCRIPTION line.");
  if (parsed.category === "") throw new AdlParseError(label, 1, "no CATEGORY line.");
  if (parsed.entries.length === 0) throw new AdlParseError(label, 1, "no DEFINE SYSTEM line.");
  return parsed;
}

function nameList(text: string): string[] {
  return text.split(",").map((part) => part.trim());
}

function dependencyForm(label: string, line: number, match: RegExpExecArray, definedNames: Set<string>): AssertForm {
  const [, subject, verb, targetText] = match as unknown as [string, string, string, string];
  const targets = nameList(targetText);
  for (const name of [subject, ...targets]) {
    if (!definedNames.has(name)) throw new AdlParseError(label, line, `"${name}" is not a DEFINEd COMPONENT or LIBRARY.`);
  }
  if (targets.includes(subject)) throw new AdlParseError(label, line, `"${subject}" cannot depend on itself.`);
  if (new Set(targets).size !== targets.length) throw new AdlParseError(label, line, "a name is listed twice.");
  return { form: verb === "IS DEPENDENT ON" ? "dependent-on" : "no-dependency-on", subject, targets };
}

function formOf(label: string, line: number, text: string, definedNames: Set<string>): AssertForm {
  const dependency = DEPENDENCY_ASSERT.exec(text);
  if (dependency) return dependencyForm(label, line, dependency, definedNames);
  const secret = SECRET_ASSERT.exec(text);
  if (secret) return { form: "secret", directory: secret[1]!, secret: secret[2]! };
  return { form: "free" };
}

function ruleContradiction(rules: AdlRule[], label: string): void {
  const allowed = new Map<string, Set<string>>();
  for (const rule of rules) {
    if (rule.form.form === "dependent-on") allowed.set(rule.form.subject, new Set([...(allowed.get(rule.form.subject) ?? []), ...rule.form.targets]));
  }
  for (const rule of rules) {
    const { form } = rule;
    if (form.form !== "no-dependency-on") continue;
    const clash = form.targets.find((target) => allowed.get(form.subject)?.has(target));
    if (clash) throw new AdlParseError(label, rule.line, `${form.subject} may depend on ${clash} (IS DEPENDENT ON) and may not (HAS NO DEPENDENCY ON).`);
  }
}

function buildRules(parsed: Parsed, label: string): AdlRule[] {
  const definedNames = new Set(parsed.entries.filter((entry) => entry.kind !== "SYSTEM").map((entry) => entry.name));
  const seen = new Map<string, number>();
  const rules = parsed.asserts.map((assert): AdlRule => {
    const id = ruleId(assert.text);
    const first = seen.get(id);
    if (first !== undefined) throw new AdlParseError(label, assert.line, `the same rule as line ${first}.`);
    seen.set(id, assert.line);
    return { id, text: assert.text, line: assert.line, group: assert.group, form: formOf(label, assert.line, assert.text, definedNames) };
  });
  ruleContradiction(rules, label);
  return rules;
}

function groupsOf(parsed: Parsed, rules: AdlRule[]): AdlGroup[] {
  const groups: AdlGroup[] = [];
  parsed.asserts.forEach((assert, index) => {
    const last = groups[groups.length - 1];
    if (last && last.line === assert.groupLine) last.ruleIds.push(rules[index]!.id);
    else groups.push({ heading: assert.group, line: assert.groupLine, ruleIds: [rules[index]!.id] });
  });
  return groups;
}

/** One regex that finds the next keyword, defined name, path or identifier in an ASSERT's text. */
function bodyPattern(entries: AdlEntry[]): RegExp {
  const names = entries
    .map((entry) => entry.name)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);
  const parts = [
    `(?<keyword>\\b(?:${KEYWORDS.map(escapeRegex).join("|")})\\b)`,
    ...(names.length > 0 ? [`(?<name>(?<![\\w/-])(?:${names.join("|")})(?![\\w/-]))`] : []),
    "(?<path>[\\w.-]+(?:/[\\w.-]+)+)",
    "(?<path2>\\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\\b)",
  ];
  return new RegExp(parts.join("|"), "g");
}

function tokenizeBody(body: string, pattern: RegExp): AdlToken[] {
  const tokens: AdlToken[] = [];
  let last = 0;
  for (const match of body.matchAll(pattern)) {
    if (match.index > last) tokens.push({ text: body.slice(last, match.index), kind: "text" });
    const groups = match.groups!;
    const kind: AdlTokenKind = groups.keyword ? "keyword" : groups.name ? "name" : "path";
    tokens.push({ text: match[0], kind });
    last = match.index + match[0].length;
  }
  if (last < body.length) tokens.push({ text: body.slice(last), kind: "text" });
  return tokens;
}

const word = (text: string): AdlToken => ({ text, kind: "keyword" });
const plain = (text: string): AdlToken => ({ text, kind: "text" });

function tokensOf(kind: AdlLineKind, raw: string, pattern: RegExp): AdlToken[] {
  if (kind === "blank") return raw === "" ? [] : [plain(raw)];
  if (kind === "comment") {
    const [, indent, comment] = COMMENT_LINE.exec(raw)!;
    return [...(indent ? [plain(indent)] : []), { text: comment!, kind: "comment" }];
  }
  if (kind === "header") {
    const key = HEADER_LINE.exec(raw)![1]!;
    return [word(key), plain(raw.slice(key.length))];
  }
  if (kind === "define") {
    const [, indent, defineKind, name, path, trailing] = DEFINE_LINE.exec(raw)!;
    const tokens: AdlToken[] = [...(indent ? [plain(indent)] : []), word("DEFINE"), plain(" "), word(defineKind!), plain(" "), { text: name!, kind: "name" }];
    tokens.push(plain(" "), word("AS"), plain(" "), { text: path!, kind: "path" });
    return trailing ? [...tokens, plain(trailing)] : tokens;
  }
  const [, body, trailing] = ASSERT_LINE.exec(raw)!;
  const tokens: AdlToken[] = [word("ASSERT"), plain("("), ...tokenizeBody(body!, pattern), plain(")")];
  return trailing ? [...tokens, plain(trailing)] : tokens;
}

function sourceLines(lines: RawLine[], parsed: Parsed): AdlSourceLine[] {
  const pattern = bodyPattern(parsed.entries);
  return lines.map(({ number, raw }) => {
    const kind = parsed.kinds.get(number)!;
    return { number, raw, kind, tokens: tokensOf(kind, raw, pattern) };
  });
}

/**
 * Parses the contents of a `.adl` file. Anything it cannot parse throws an
 * `AdlParseError` that names `label` and the line, so a bad file fails with a
 * place to look rather than with a rule quietly missing.
 */
export function parseAdlDocument(content: string, label = "structure.adl"): AdlDocument {
  const lines = content.split("\n").map((raw, index): RawLine => ({ number: index + 1, raw }));
  if (lines[lines.length - 1]?.raw === "") lines.pop();

  const parsed = readStructure(lines, label);
  const rules = buildRules(parsed, label);
  return {
    description: parsed.description,
    category: parsed.category,
    entries: parsed.entries,
    rules,
    groups: groupsOf(parsed, rules),
    lines: sourceLines(lines, parsed),
  };
}

const ADL_LOCATIONS = [join("architecture", "adl", "structure.adl"), "structure.adl"];

/** The ADL file under `repoRoot` (the real one, or a fixture's), as a repo-relative path, if any. */
export function findAdlFile(repoRoot: string): string | undefined {
  return ADL_LOCATIONS.find((relative) => existsSync(join(repoRoot, relative)));
}

/** Reads and parses the ADL under `repoRoot`; its parse errors name the repo-relative path. */
export function loadAdlDocument(repoRoot: string): AdlDocument {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) throw new Error("architecture/adl/structure.adl not found");
  return parseAdlDocument(readFileSync(join(repoRoot, adlFile), "utf8"), adlFile);
}

/** What `emitAdlJson` writes: the parsed document, plus where it came from. */
export interface AdlJson extends AdlDocument {
  schema: 1;
  source: string;
}

export function adlToJson(document: AdlDocument, source: string): AdlJson {
  return { schema: 1, source, ...document };
}
