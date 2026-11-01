import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import MarkdownIt from "markdown-it";

export interface Adr {
  /** e.g. "ADR-0001" */
  id: string;
  title: string;
  status: string;
  date: string;
  /** The "## Summary" section: one line, at or under SUMMARY_MAX_LENGTH characters. */
  summary: string;
  /** The "## Part" section: which series part this decision belongs to (1-PART_COUNT), or "bonus" for the detour between Part 4 and Part 5 (ADR-0027). */
  part: number | "bonus";
  /**
   * The "## Change request" section's three parts (### Why now, ### In scope, ### Out of scope), rendered the same way, for an ADR that records a change
   * request (ADR-0027). Absent for the others.
   */
  changeRequest?: { whyNowHtml: string; inScopeHtml: string; outOfScopeHtml: string };
  /** "## Context", rendered from Markdown to HTML at build time (see ADR-0007). */
  contextHtml: string;
  /** "## Decision", rendered from Markdown to HTML at build time. */
  decisionHtml: string;
  /** "## Consequences", rendered from Markdown to HTML at build time. */
  consequencesHtml: string;
  /** "## Alternatives", rendered from Markdown to HTML at build time. */
  alternativesHtml: string;
  /** "## Links", rendered from Markdown to HTML at build time. */
  linksHtml: string;
  filename: string;
}

const TITLE_LINE = /^#\s*(ADR-\d+):\s*(.+)$/m;
const HEADING_LINE = /^##\s+(.+)$/;
const PART_COUNT = 6;

const REQUIRED_SECTIONS = ["status", "date", "summary", "part", "context", "decision", "consequences", "alternatives", "links"] as const;

// The design's decisions row has one line for the summary -- measured from
// that row, not picked arbitrarily (see content/series.json's identical
// budget pattern for card copy).
export const SUMMARY_MAX_LENGTH = 60;

// html: false (the default, kept explicit) means raw HTML embedded in an
// ADR file is escaped rather than rendered -- see ADR-0007.
const md = new MarkdownIt({ html: false });

/**
 * Parses one ADR markdown file's real content (title, and every required
 * section) rather than paraphrasing or hardcoding it. Throws with the
 * filename and the missing section name if the file doesn't have one of
 * the sections every ADR in this repo is expected to carry (see
 * architecture/adr/000*.md for the shape).
 */
export function parseAdr(content: string, filename: string): Adr {
  const titleMatch = TITLE_LINE.exec(content);
  if (!titleMatch) {
    throw new Error(`${filename}: missing a "# ADR-NNNN: Title" heading`);
  }
  const [, id, title] = titleMatch;

  const sections = new Map<string, string>();
  let currentHeading: string | null = null;
  let buffer: string[] = [];
  const flush = (): void => {
    if (currentHeading) {
      sections.set(currentHeading.toLowerCase(), buffer.join("\n").trim());
    }
  };

  for (const line of content.split("\n")) {
    const headingMatch = HEADING_LINE.exec(line);
    if (headingMatch) {
      flush();
      currentHeading = headingMatch[1]!.trim();
      buffer = [];
    } else if (currentHeading) {
      buffer.push(line);
    }
  }
  flush();

  for (const section of REQUIRED_SECTIONS) {
    const value = sections.get(section);
    if (!value) {
      const heading = section[0]!.toUpperCase() + section.slice(1);
      throw new Error(`${filename}: missing required "## ${heading}" section`);
    }
  }

  const summary = sections.get("summary")!.trim();
  if (summary.length > SUMMARY_MAX_LENGTH) {
    throw new Error(
      `${filename}: "## Summary" is ${summary.length} characters, over the ${SUMMARY_MAX_LENGTH}-character row budget: ${JSON.stringify(summary)}`,
    );
  }

  const partRaw = sections.get("part")!.trim();
  const part = partRaw.toLowerCase() === "bonus" ? "bonus" : Number(partRaw);
  if (part !== "bonus" && (!Number.isInteger(part) || part < 1 || part > PART_COUNT)) {
    throw new Error(`${filename}: "## Part" must be an integer 1-${PART_COUNT} or "Bonus", got ${JSON.stringify(partRaw)}`);
  }

  const changeRequest = parseChangeRequest(sections.get("change request"), filename);

  return {
    id: id!,
    title: title!.trim(),
    // The first line is the status; a later line may clarify the record (ADR-0011) and is not part of it.
    status: sections.get("status")!.split("\n")[0]!.trim(),
    date: sections.get("date")!,
    summary,
    part,
    ...(changeRequest ? { changeRequest } : {}),
    contextHtml: md.render(sections.get("context")!),
    decisionHtml: md.render(sections.get("decision")!),
    consequencesHtml: md.render(sections.get("consequences")!),
    alternativesHtml: md.render(sections.get("alternatives")!),
    linksHtml: md.render(sections.get("links")!),
    filename,
  };
}

const CHANGE_REQUEST_PARTS = [
  ["why now", "whyNowHtml"],
  ["in scope", "inScopeHtml"],
  ["out of scope", "outOfScopeHtml"],
] as const;

/** The three `###` parts of a "## Change request" section, each rendered from Markdown; a section that lacks one is an error, not a half panel. */
function parseChangeRequest(body: string | undefined, filename: string): Adr["changeRequest"] {
  if (body === undefined) return undefined;
  const parts = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of body.split("\n")) {
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading) {
      current = heading[1]!.trim().toLowerCase();
      parts.set(current, []);
    } else if (current) parts.get(current)!.push(line);
  }
  const html: Record<string, string> = {};
  for (const [title, key] of CHANGE_REQUEST_PARTS) {
    const text = parts.get(title)?.join("\n").trim();
    if (!text) throw new Error(`${filename}: "## Change request" is missing its "### ${title[0]!.toUpperCase()}${title.slice(1)}" part`);
    html[key] = md.render(text);
  }
  return html as NonNullable<Adr["changeRequest"]>;
}

/** Parses every `*.md` file in `architecture/adr/`, sorted by filename (ADR number). */
export function loadAdrs(dirPath: string): Adr[] {
  const files = readdirSync(dirPath)
    .filter((name) => name.endsWith(".md"))
    .sort();
  if (files.length === 0) {
    throw new Error(`${dirPath}: no ADR markdown files found`);
  }
  return files.map((file) => parseAdr(readFileSync(join(dirPath, file), "utf8"), file));
}
