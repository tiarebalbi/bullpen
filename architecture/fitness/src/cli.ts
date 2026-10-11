import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runChecks } from "./run-checks.js";
import { formatViolations } from "./violation.js";

// This file lives at architecture/fitness/src/cli.ts, so the real repo root
// is three levels up: src -> fitness -> architecture -> <repo root>.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const results = runChecks(repoRoot);
const violations = results.flatMap((result) => result.violations);

if (violations.length > 0) {
  console.error(formatViolations(violations));
  const failing = results.filter((result) => result.violations.length > 0).map((result) => result.name);
  console.error(`\ncheck:arch failed: ${violations.length} violation(s) in ${failing.join(", ")}`);
  process.exit(1);
}

console.log(`check:arch passed: ${results.length} checks held, ${results.reduce((n, r) => n + r.rules.length, 0)} rules enforced`);
process.exit(0);
