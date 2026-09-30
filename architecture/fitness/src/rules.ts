import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAdlRules, type AdlRule } from "./parse-adl.js";
import type { Violation } from "./violation.js";

/**
 * Rules worded exactly as they are written in architecture/adl/structure.adl.
 * A failure quotes these, so an agent sees the rule the way it was written.
 * `checkAdlEnforced` fails if the ADL stops stating one of them, and if the
 * ADL states a rule that nothing here enforces.
 */
export const ADL_RULE = {
  defined: "every directory under apps/ and packages/ is DEFINED here",
  exists: "every DEFINED component and library exists as a directory",
  appsNeverDependOnApps: "apps NEVER DEPEND ON other apps",
  librariesNeverDependOnApps: "libraries NEVER DEPEND ON apps",
  entryPoint: "apps IMPORT libraries ONLY THROUGH their package entry point",
  componentsMapped: "every DEFINED component and library maps to a node in the current CALM moment",
  nodesMapped: "every webclient and service node in the current CALM moment maps to a DEFINED entry",
} as const;

/** `ONLY <directory> READS <NAME>`: one secret, readable from one place. */
export const SECRET_RULE_PATTERN = /^ONLY (\S+) READS (\S+)$/;

const ADL_LOCATIONS = [join("architecture", "adl", "structure.adl"), "structure.adl"];

/** The ADL file under `repoRoot` (the real one, or a fixture's), as a repo-relative path, if any. */
export function findAdlFile(repoRoot: string): string | undefined {
  return ADL_LOCATIONS.find((relative) => existsSync(join(repoRoot, relative)));
}

/** `structure.adl:<line>` for the ASSERT that states `ruleText`, or plain `structure.adl` if it is not stated. */
export function citeAdl(repoRoot: string, ruleText: string): string {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) return "structure.adl";
  const found = parseAdlRules(readFileSync(join(repoRoot, adlFile), "utf8")).find((rule) => rule.text === ruleText);
  return found ? `structure.adl:${found.line}` : "structure.adl";
}

const KNOWN_ADL_RULES: readonly string[] = Object.values(ADL_RULE);

/**
 * "A rule that cannot fail a build is documentation": every ASSERT in the ADL
 * must be one a check enforces, and every rule a check enforces must still be
 * written in the ADL. Either gap is reported here.
 */
export function checkAdlEnforced(repoRoot: string): Violation[] {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) return [];
  const asserted: AdlRule[] = parseAdlRules(readFileSync(join(repoRoot, adlFile), "utf8"));
  const violations: Violation[] = [];

  for (const rule of asserted) {
    if (KNOWN_ADL_RULES.includes(rule.text) || SECRET_RULE_PATTERN.test(rule.text)) continue;
    violations.push({
      check: "rule coverage",
      rule: rule.text,
      where: `${adlFile}:${rule.line}`,
      why: "No check in architecture/fitness enforces this rule, so it is documentation, not a rule (ADR-0009).",
      fix: "Add a check that fails when the rule is broken, or remove the ASSERT.",
    });
  }

  const assertedTexts = new Set(asserted.map((rule) => rule.text));
  for (const text of KNOWN_ADL_RULES) {
    if (assertedTexts.has(text)) continue;
    violations.push({
      check: "rule coverage",
      rule: text,
      where: adlFile,
      why: "A check still enforces this rule, but the ADL no longer states it (ADR-0009).",
      fix: `Restore ASSERT(${text}) in ${adlFile}, or remove the check that enforces it.`,
    });
  }
  return violations;
}
