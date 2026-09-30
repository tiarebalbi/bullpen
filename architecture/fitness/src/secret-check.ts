import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseAdlRules } from "./parse-adl.js";
import { SECRET_RULE_PATTERN, citeAdl, findAdlFile } from "./rules.js";
import { lineAt, scanFiles } from "./source-scan.js";
import type { Violation } from "./violation.js";

const CHECK = "secret containment";

/**
 * "ONLY <directory> READS <NAME>": the secret named in an ADL rule appears in
 * code only under that directory. Every `ONLY ... READS ...` ASSERT in the
 * ADL is enforced, so adding a second secret means adding a second line
 * there, not editing this file.
 *
 * Comments, docs and .env.example files are not code and are not scanned:
 * naming a variable in prose is not reading it. A dynamically built name
 * (process.env[`COINGECKO_${x}`]) is not something a text scan can see.
 */
export function checkSecretContainment(repoRoot: string): Violation[] {
  const adlFile = findAdlFile(repoRoot);
  if (!adlFile) return [];

  const rules = parseAdlRules(readFileSync(join(repoRoot, adlFile), "utf8"))
    .map((rule) => ({ rule, match: SECRET_RULE_PATTERN.exec(rule.text) }))
    .filter((entry): entry is { rule: (typeof entry)["rule"]; match: RegExpExecArray } => entry.match !== null);
  if (rules.length === 0) return [];

  const files = scanFiles(repoRoot, ["apps", "packages"]);
  const violations: Violation[] = [];

  for (const { rule, match } of rules) {
    const directory = match[1]!.replace(/\/+$/, "");
    const secret = match[2]!;
    const reading = new RegExp(`(?<![A-Za-z0-9_])${secret}(?![A-Za-z0-9_])`, "g");

    for (const file of files) {
      if (file.path.startsWith(`${directory}/`)) continue;
      const first = reading.exec(file.code);
      reading.lastIndex = 0;
      if (!first) continue;
      violations.push({
        check: CHECK,
        rule: rule.text,
        where: `${file.path}:${lineAt(file.code, first.index)}`,
        why: `${file.path} reads ${secret}, which only ${directory} may read, so the secret stays in one place (${citeAdl(repoRoot, rule.text)}).`,
        fix: `Move the read into ${directory} and pass the result out, or call that route instead of reading ${secret} here.`,
      });
    }
  }
  return violations;
}
