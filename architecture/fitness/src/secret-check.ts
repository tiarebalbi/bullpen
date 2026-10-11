import { findAdlFile, loadAdlDocument, type AdlRule } from "./adl.js";
import { citeAdl } from "./rules.js";
import { lineAt, scanFiles } from "./source-scan.js";
import type { Violation } from "./violation.js";

const CHECK = "secret containment";

type SecretRule = AdlRule & { form: { form: "secret"; directory: string; secret: string } };

const isSecretRule = (rule: AdlRule): rule is SecretRule => rule.form.form === "secret";

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
  if (!findAdlFile(repoRoot)) return [];

  const rules = loadAdlDocument(repoRoot).rules.filter(isSecretRule);
  if (rules.length === 0) return [];

  const files = scanFiles(repoRoot, ["apps", "packages"]);
  const violations: Violation[] = [];

  for (const rule of rules) {
    const directory = rule.form.directory.replace(/\/+$/, "");
    const secret = rule.form.secret;
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
