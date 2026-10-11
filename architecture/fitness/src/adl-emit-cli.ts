import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { emitAdlJson, LANDING_ADL_JSON } from "./adl-emit.js";

// Usage: adl:emit
// Writes apps/landing/.generated/adl.json from architecture/adl/structure.adl.
// The landing app runs it before it builds, tests or type-checks.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

try {
  const json = emitAdlJson(repoRoot);
  console.log(`adl:emit wrote ${LANDING_ADL_JSON}: ${json.rules.length} rules in ${json.groups.length} groups from ${json.source}`);
} catch (error) {
  console.error(`adl:emit failed: ${(error as Error).message}`);
  process.exit(1);
}
