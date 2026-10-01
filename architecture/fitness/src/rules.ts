import { findAdlFile, loadAdlDocument, parseAdlDocument, type AdlRule } from "./adl.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Violation } from "./violation.js";

/**
 * The ASSERTs whose wording is fixed, worded exactly as they are written in
 * architecture/adl/structure.adl. A failure quotes these, so an agent sees
 * the rule the way it was written. `checkAdlEnforced` fails if the ADL stops
 * stating one of them, and if the ADL states a rule nothing enforces.
 *
 * The dependency rules (`A IS DEPENDENT ON B`, `A HAS NO DEPENDENCY ON B`) and
 * the secret rules (`ONLY <directory> READS <NAME>`) are not listed here: they
 * are read from the ADL by form, so a new component or secret is a new ASSERT
 * and not an edit to this file.
 */
export const ADL_RULE = {
  defined: "every directory under apps and packages is DEFINED",
  exists: "every DEFINED COMPONENT and LIBRARY exists as a directory",
  entryPoint: "COMPONENTS use LIBRARIES ONLY THROUGH their package entry point",
  componentsMapped: "every DEFINED COMPONENT and LIBRARY maps to a node in the current CALM moment",
  nodesMapped: "every webclient and service node in the current CALM moment maps to a DEFINED entry",
} as const;

const KNOWN_ADL_RULES: readonly string[] = Object.values(ADL_RULE);

/** The forms a check enforces by reading the rule itself, whatever it names. */
const ENFORCED_FORMS = new Set<AdlRule["form"]["form"]>(["dependent-on", "no-dependency-on", "secret"]);

/** `structure.adl:<line>` for the ASSERT that states `ruleText`, or plain `structure.adl` if it is not stated or the file cannot be read. */
export function citeAdl(repoRoot: string, ruleText: string): string {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) return "structure.adl";
  try {
    const found = parseAdlDocument(readFileSync(join(repoRoot, adlFile), "utf8"), adlFile).rules.find((rule) => rule.text === ruleText);
    return found ? `structure.adl:${found.line}` : "structure.adl";
  } catch {
    return "structure.adl";
  }
}

/**
 * "A rule that cannot fail a build is documentation": every ASSERT in the ADL
 * must be one a check enforces, and every rule a check enforces must still be
 * written in the ADL. Either gap is reported here.
 */
export function checkAdlEnforced(repoRoot: string): Violation[] {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) return [];
  const asserted = loadAdlDocument(repoRoot).rules;
  const violations: Violation[] = [];

  for (const rule of asserted) {
    if (KNOWN_ADL_RULES.includes(rule.text) || ENFORCED_FORMS.has(rule.form.form)) continue;
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
