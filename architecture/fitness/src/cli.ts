import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAdlFile } from "./parse-adl.js";
import { checkStructure } from "./structure-check.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// This file lives at architecture/fitness/src/cli.ts, so the real repo root
// is three levels up: src -> fitness -> architecture -> <repo root>.
const repoRoot = join(__dirname, "..", "..", "..");
const adlPath = join(repoRoot, "architecture", "adl", "structure.adl");

const entries = parseAdlFile(adlPath);
const violations = checkStructure(entries, repoRoot);

if (violations.length > 0) {
  for (const violation of violations) {
    console.error(violation);
  }
  console.error(
    `\ncheck:arch failed: ${violations.length} violation(s) of architecture/adl/structure.adl`,
  );
  process.exit(1);
} else {
  console.log(
    `check:arch passed: ${entries.length} ADL entries verified against ${repoRoot}`,
  );
  process.exit(0);
}
