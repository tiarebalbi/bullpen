import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface Adr {
  /** e.g. "ADR-0001" */
  id: string;
  title: string;
  status: string;
  date: string;
  /** First paragraph of the "## Context" section. */
  contextExcerpt: string;
  /** First paragraph of the "## Decision" section. */
  decisionExcerpt: string;
  filename: string;
}

const TITLE_LINE = /^#\s*(ADR-\d+):\s*(.+)$/m;
const HEADING_LINE = /^##\s+(.+)$/;

const REQUIRED_SECTIONS = ["status", "date", "context", "decision"] as const;

function firstParagraph(text: string): string {
  const trimmed = text.trim();
  const [first = ""] = trimmed.split(/\n\s*\n/);
  return first.replace(/\s+/g, " ").trim();
}

/**
 * Parses one ADR markdown file's real content (title, Status, Date, and
 * excerpts of Context/Decision) rather than paraphrasing or hardcoding it.
 * Throws with the filename and the missing section name if the file
 * doesn't have one of the sections every ADR in this repo is expected to
 * carry (see architecture/adr/000*.md for the shape).
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

  return {
    id: id!,
    title: title!.trim(),
    status: sections.get("status")!,
    date: sections.get("date")!,
    contextExcerpt: firstParagraph(sections.get("context")!),
    decisionExcerpt: firstParagraph(sections.get("decision")!),
    filename,
  };
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
