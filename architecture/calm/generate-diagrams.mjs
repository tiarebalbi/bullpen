#!/usr/bin/env node
// Regenerates the Part 1 CALM diagram and copies it into the landing app's
// build input. `generated/` is a build artifact (gitignored) — this script
// is what makes it reproducible, not the committed source of truth.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
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

// docify's SVG export needs a local Chrome/Chromium to render mermaid
// diagrams; on a build host without one (confirmed: Vercel's build image)
// it logs a warning and degrades to mermaid code blocks instead of failing,
// so `source` may legitimately not exist here. That's not this script's
// job to fix (see docify's own --browser-path option for that) -- when it
// happens, keep whatever part-01.svg is already committed (regenerated
// locally or in CI, where a browser is available) rather than crashing the
// whole app build over an optional diagram refresh.
if (existsSync(source)) {
  copyFileSync(source, dest);
  console.log(`Copied ${source} -> ${dest}`);
} else if (existsSync(dest)) {
  console.warn(
    `WARNING: ${source} was not produced (no browser available for docify's SVG export) -- keeping the already-committed ${dest} as-is.`,
  );
} else {
  throw new Error(
    `${source} was not produced and no existing ${dest} is committed to fall back to -- the landing page has no diagram to render.`,
  );
}
