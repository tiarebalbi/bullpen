import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";
import { formatViolation, type Violation } from "./violation.js";

export const fixturesRoot = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
export const realRepoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

/** A path like /Users/x/..., /tmp/..., /private/var/... or C:\..., anywhere in `text`. */
const ABSOLUTE_PATH = /(^|[\s"'`(=])(\/(?:Users|home|private|tmp|var|opt|etc)\/|[A-Za-z]:[\\/])/;

export function expectNoAbsolutePaths(text: string): void {
  expect(text, "a failure must not contain an absolute path").not.toMatch(ABSOLUTE_PATH);
}

/**
 * Asserts the one failure format every check reports:
 *
 *   ✗ <check>: <rule>
 *     where:   <path relative to the repo root>
 *     why:     <one sentence> (<ADL line or ADR number>)
 *     fix:     <the smallest change that satisfies the rule>
 *
 * Returns the rendered text so a test can assert on its content as well.
 */
export function expectFailureFormat(violation: Violation, check: string): string {
  const text = formatViolation(violation);
  const lines = text.split("\n");

  expect(lines).toHaveLength(4);
  expect(lines[0]).toBe(`✗ ${check}: ${violation.rule}`);
  expect(violation.rule.trim()).not.toBe("");
  expect(lines[1]).toMatch(/^ {2}where: {3}\S/);
  expect(lines[2]).toMatch(/^ {2}why: {5}.+ \((?:structure\.adl(?::\d+)?|ADR-\d{4}(?:, ADR-\d{4})*)\)\.$/);
  expect(lines[3]).toMatch(/^ {2}fix: {5}\S/);
  expect(lines[1]!.slice("  where:   ".length)).not.toMatch(/^[/\\]|^[A-Za-z]:/);
  expectNoAbsolutePaths(text);
  return text;
}

/** A writable copy of a fixture directory, for tests that break one thing and look at the result. */
export function copyFixture(name: string): string {
  const target = mkdtempSync(join(tmpdir(), `fitness-${name}-`));
  cpSync(join(fixturesRoot, name), target, { recursive: true });
  return target;
}

export function readJsonFile<T>(root: string, relative: string): T {
  return JSON.parse(readFileSync(join(root, relative), "utf8")) as T;
}

export function writeJsonFile(root: string, relative: string, value: unknown): void {
  writeFileSync(join(root, relative), `${JSON.stringify(value, null, 2)}\n`);
}
