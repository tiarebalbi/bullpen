import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkBoundaries, type BoundariesRunner } from "./boundaries-check.js";
import { BUDGET_RULE, checkBudgetAt, type AllowanceEntry } from "./budget-check.js";
import { EMAIL_RULE, checkEmailInFiles } from "./email-in-files-check.js";
import { EXPLORER_RULE, checkAllExplorerParts } from "./explorer-consistency-check.js";
import { checkEntryPointImports } from "./imports-check.js";
import { ADR_LINKED_RULE, CONTROL_POINTER_RULE, EXTERNAL_SYSTEM_RULE, checkModelCurrency } from "./model-currency-check.js";
import { parseAdlFile, parseAdlRules, type AdlEntry } from "./parse-adl.js";
import { ADL_RULE, SECRET_RULE_PATTERN, checkAdlEnforced, findAdlFile } from "./rules.js";
import { checkSecretContainment } from "./secret-check.js";
import { checkStructure } from "./structure-check.js";
import type { Violation } from "./violation.js";

export interface CheckContext {
  repoRoot: string;
  entries: AdlEntry[];
  allowances: AllowanceEntry[];
  boundariesRunner?: BoundariesRunner;
}

export interface CheckDefinition {
  name: string;
  /** What the check holds the repo to, worded as in the ADL (or the ADR that records it), for the rules snapshot. */
  rules: string[] | ((context: CheckContext) => string[]);
  run: (context: CheckContext) => Violation[];
}

/** Every check `check:arch` runs, in the order it reports them. */
export const CHECKS: CheckDefinition[] = [
  { name: "structure", rules: [ADL_RULE.defined, ADL_RULE.exists], run: ({ repoRoot, entries }) => checkStructure(entries, repoRoot) },
  {
    name: "turbo boundaries",
    rules: [ADL_RULE.appsNeverDependOnApps, ADL_RULE.librariesNeverDependOnApps],
    run: ({ repoRoot, boundariesRunner }) => checkBoundaries(repoRoot, boundariesRunner),
  },
  { name: "entry-point imports", rules: [ADL_RULE.entryPoint], run: ({ repoRoot }) => checkEntryPointImports(repoRoot) },
  {
    name: "secret containment",
    rules: ({ repoRoot }) => {
      const adlFile = findAdlFile(repoRoot);
      if (!adlFile) return [];
      return parseAdlRules(readFileSync(join(repoRoot, adlFile), "utf8"))
        .map((rule) => rule.text)
        .filter((text) => SECRET_RULE_PATTERN.test(text));
    },
    run: ({ repoRoot }) => checkSecretContainment(repoRoot),
  },
  {
    name: "model currency",
    rules: [ADL_RULE.componentsMapped, ADL_RULE.nodesMapped, EXTERNAL_SYSTEM_RULE, ADR_LINKED_RULE, CONTROL_POINTER_RULE],
    run: ({ repoRoot, entries }) => checkModelCurrency(repoRoot, entries),
  },
  { name: "budget", rules: [BUDGET_RULE], run: ({ repoRoot, allowances }) => checkBudgetAt(repoRoot, allowances) },
  { name: "explorer consistency", rules: [EXPLORER_RULE], run: ({ repoRoot }) => checkAllExplorerParts(repoRoot) },
  { name: "email in files", rules: [EMAIL_RULE], run: ({ repoRoot }) => checkEmailInFiles(repoRoot) },
  { name: "rule coverage", rules: ["every ADL ASSERT is enforced by a check, and every enforced rule is still in the ADL"], run: ({ repoRoot }) => checkAdlEnforced(repoRoot) },
];

export interface CheckResult {
  name: string;
  rules: string[];
  violations: Violation[];
}

/** Loads what the checks need from `repoRoot` and runs every check. */
export function runChecks(repoRoot: string, options: { boundariesRunner?: BoundariesRunner } = {}): CheckResult[] {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) throw new Error("architecture/adl/structure.adl not found");
  const context: CheckContext = {
    repoRoot,
    entries: parseAdlFile(join(repoRoot, adlFile)),
    allowances: JSON.parse(readFileSync(join(repoRoot, "cost", "allowances.json"), "utf8")) as AllowanceEntry[],
    boundariesRunner: options.boundariesRunner,
  };
  return CHECKS.map((check) => ({
    name: check.name,
    rules: typeof check.rules === "function" ? check.rules(context) : check.rules,
    violations: check.run(context),
  }));
}
