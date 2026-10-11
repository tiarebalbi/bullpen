import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { slug, type AdlDocument, type AdlRule } from "./adl.js";
import type { Violation } from "./violation.js";

const CHECK = "turbo boundaries";

/** Recorded in ADR-0003: the catch-all for anything turbo reports, or turbo.json holds, that no ADL rule names. */
export const BOUNDARIES_RULE = "turbo boundaries finds no dependency or import that crosses a package boundary";

/** The tag a component or library carries in its own turbo.json: its ADL name, as a slug (`Trading App` -> `trading-app`). */
export const tagFor = (name: string): string => slug(name);

interface TagRules {
  allow: Set<string>;
  deny: Set<string>;
}

interface TurboJson {
  boundaries?: { tags?: Record<string, { dependencies?: { allow?: string[]; deny?: string[] } }> };
  tags?: string[];
}

type DependencyRule = AdlRule & { form: { form: "dependent-on" | "no-dependency-on"; subject: string; targets: string[] } };

const isDependencyRule = (rule: AdlRule): rule is DependencyRule => rule.form.form === "dependent-on" || rule.form.form === "no-dependency-on";

function readTurboJson(repoRoot: string, relative: string): TurboJson | null {
  const file = join(repoRoot, relative);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as TurboJson;
  } catch {
    return null;
  }
}

/**
 * What turbo.json has to say for `turbo boundaries` to enforce the ADL: for
 * each component or library, `IS DEPENDENT ON` becomes an allow-list and
 * `HAS NO DEPENDENCY ON` a deny-list, over the tags the others carry. Turbo
 * applies both transitively, which is why `HAS NO DEPENDENCY ON` reaches an app
 * that depends on another through a library.
 */
export function expectedTagRules(adl: AdlDocument): Map<string, TagRules> {
  const expected = new Map<string, TagRules>();
  for (const rule of adl.rules.filter(isDependencyRule)) {
    const tag = tagFor(rule.form.subject);
    const entry = expected.get(tag) ?? { allow: new Set<string>(), deny: new Set<string>() };
    for (const target of rule.form.targets) (rule.form.form === "dependent-on" ? entry.allow : entry.deny).add(tagFor(target));
    expected.set(tag, entry);
  }
  return expected;
}

function missingRule(rule: DependencyRule, configured: TagRules | undefined): Violation[] {
  const list = rule.form.form === "dependent-on" ? "allow" : "deny";
  const subjectTag = tagFor(rule.form.subject);
  const have = configured?.[list] ?? new Set<string>();
  const missing = rule.form.targets.map(tagFor).filter((target) => !have.has(target));
  if (missing.length === 0) return [];
  const quoted = missing.map((target) => `"${target}"`).join(", ");
  return [
    {
      check: CHECK,
      rule: rule.text,
      where: "turbo.json",
      why: `turbo.json does not ${list} the ${missing.length === 1 ? "tag" : "tags"} ${quoted} for the tag "${subjectTag}", so turbo boundaries would not catch a breach of this rule (structure.adl:${rule.line}).`,
      fix: `Add ${quoted} to boundaries.tags.${subjectTag}.dependencies.${list} in turbo.json.`,
    },
  ];
}

function configuredRules(turbo: TurboJson): Map<string, TagRules> {
  const configured = new Map<string, TagRules>();
  for (const [tag, rules] of Object.entries(turbo.boundaries?.tags ?? {})) {
    configured.set(tag, { allow: new Set(rules.dependencies?.allow ?? []), deny: new Set(rules.dependencies?.deny ?? []) });
  }
  return configured;
}

function unstatedRules(expected: Map<string, TagRules>, configured: Map<string, TagRules>): Violation[] {
  const violations: Violation[] = [];
  for (const [tag, rules] of configured) {
    const wanted = expected.get(tag);
    for (const list of ["allow", "deny"] as const) {
      for (const target of rules[list]) {
        if (wanted?.[list].has(target)) continue;
        violations.push({
          check: CHECK,
          rule: BOUNDARIES_RULE,
          where: "turbo.json",
          why: `turbo.json ${list === "allow" ? "allows" : "denies"} the tag "${target}" for the tag "${tag}", and no ASSERT in structure.adl states it, so the build holds a rule the ADL does not (ADR-0003).`,
          fix: `Remove "${target}" from boundaries.tags.${tag}.dependencies.${list}, or write the rule in structure.adl first.`,
        });
      }
    }
  }
  return violations;
}

function untaggedPackages(repoRoot: string, adl: AdlDocument): Violation[] {
  const violations: Violation[] = [];
  for (const entry of adl.entries.filter((candidate) => candidate.kind !== "SYSTEM")) {
    const tag = tagFor(entry.name);
    const turbo = readTurboJson(repoRoot, `${entry.path}/turbo.json`);
    if (turbo?.tags?.includes(tag)) continue;
    violations.push({
      check: CHECK,
      rule: BOUNDARIES_RULE,
      where: `${entry.path}/turbo.json`,
      why: `${entry.path} is DEFINEd as "${entry.name}" but does not carry the tag "${tag}", so turbo boundaries cannot apply the rules that name it (ADR-0003).`,
      fix: `Set "tags": ["${tag}"] in ${entry.path}/turbo.json.`,
    });
  }
  return violations;
}

/**
 * turbo.json is where `turbo boundaries` gets its rules, and the ADL is where
 * they are written. This holds the two together: every dependency ASSERT must
 * be in turbo.json, every rule in turbo.json must be an ASSERT, and every
 * DEFINEd component carries its tag. It reports the ASSERT, verbatim, that a
 * missing rule would have enforced.
 */
export function checkBoundaryTags(repoRoot: string, adl: AdlDocument): Violation[] {
  const turbo = readTurboJson(repoRoot, "turbo.json");
  if (!turbo) {
    return [
      { check: CHECK, rule: BOUNDARIES_RULE, where: "turbo.json", why: "turbo.json is missing or is not valid JSON, so turbo boundaries has no rules to apply (ADR-0003).", fix: "Restore turbo.json with a boundaries.tags section for the ADL's dependency rules." },
    ];
  }
  const expected = expectedTagRules(adl);
  const configured = configuredRules(turbo);
  const missing = adl.rules.filter(isDependencyRule).flatMap((rule) => missingRule(rule, configured.get(tagFor(rule.form.subject))));
  return [...missing, ...unstatedRules(expected, configured), ...untaggedPackages(repoRoot, adl)];
}
