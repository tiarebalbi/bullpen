#!/usr/bin/env node
// Regenerates the Part 1 CALM diagram and copies it into the landing app's
// build input. `generated/` is a build artifact (gitignored) — this script
// is what makes it reproducible, not the committed source of truth.
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const calmDir = dirname(fileURLToPath(import.meta.url));
const generatedDir = join(calmDir, "generated");
const source = join(generatedDir, "docs", "_diagrams", "index-1.svg");
const destDir = join(calmDir, "..", "..", "apps", "landing", "public", "architecture");
const dest = join(destDir, "part-01.svg");

execFileSync(
  "npx",
  [
    "--yes",
    "@finos/calm-cli@1.60.1",
    "docify",
    "-a",
    join(calmDir, "moments", "part-01.architecture.json"),
    "--export-diagrams",
    "svg",
    "-o",
    generatedDir,
  ],
  { stdio: "inherit" },
);

mkdirSync(destDir, { recursive: true });
copyFileSync(source, dest);
console.log(`Copied ${source} -> ${dest}`);
