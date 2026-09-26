import { readFileSync } from "node:fs";

export interface CheckArchResult {
  ranAt: string;
  command: string;
  exitCode: number;
  passed: boolean;
  summary: string;
  output: string;
}

const REQUIRED_KEYS = ["ranAt", "command", "exitCode", "passed", "summary", "output"] as const;

/**
 * Parses the JSON snapshot written by `scripts/run-check-arch.mjs` (a real,
 * just-run `check:arch` result — see that script). Throws on anything that
 * isn't a well-formed result, rather than rendering a fabricated pass/fail.
 */
export function parseCheckArchResult(content: string, sourceLabel: string): CheckArchResult {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (cause) {
    throw new Error(`${sourceLabel}: invalid JSON (${(cause as Error).message})`, { cause });
  }

  if (typeof data !== "object" || data === null) {
    throw new Error(`${sourceLabel}: expected a JSON object`);
  }

  for (const key of REQUIRED_KEYS) {
    if (!(key in (data as Record<string, unknown>))) {
      throw new Error(`${sourceLabel}: missing required "${key}" field`);
    }
  }

  return data as CheckArchResult;
}

export function loadCheckArchResult(filePath: string): CheckArchResult {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (cause) {
    throw new Error(
      `${filePath}: not found. Run \`node scripts/run-check-arch.mjs\` (part of this app's \`build\` script) to ` +
        "capture a real check:arch result before rendering the Rules section.",
      { cause },
    );
  }
  return parseCheckArchResult(content, filePath);
}
