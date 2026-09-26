#!/usr/bin/env node
// Runs the real `check:arch` fitness check and writes its actual pass/fail
// result to `.generated/check-arch-result.json`, which the Rules section of
// the landing page reads at build time. This captures a real, just-run
// result — never an invented one — and never fabricates a passing result:
// a failing check:arch run is written and rendered honestly too.
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const landingDir = join(here, "..");
const outDir = join(landingDir, ".generated");
const outFile = join(outDir, "check-arch-result.json");

const command = "pnpm";
const args = ["--filter", "@bullpen/fitness-checks", "run", "check:arch"];

const result = spawnSync(command, args, { encoding: "utf8", cwd: join(landingDir, "..", "..") });

if (result.error) {
  console.error(`Failed to run \`${command} ${args.join(" ")}\`:`, result.error);
  process.exit(1);
}

const stdout = (result.stdout ?? "").trim();
const stderr = (result.stderr ?? "").trim();
// pnpm echoes the underlying command ("$ tsx src/cli.ts") to stderr before
// the script itself runs, so the script's own last line of real output
// (its actual pass/fail summary) is the last non-empty line of stdout, not
// of stdout+stderr combined.
const summary =
  stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .pop() ?? "";
const output = [stdout, stderr].filter(Boolean).join("\n");
const exitCode = result.status ?? 1;
const passed = exitCode === 0;

mkdirSync(outDir, { recursive: true });
writeFileSync(
  outFile,
  JSON.stringify(
    {
      ranAt: new Date().toISOString(),
      command: [command, ...args].join(" "),
      exitCode,
      passed,
      summary,
      output,
    },
    null,
    2,
  ) + "\n",
);

console.log(`Wrote ${outFile} (passed=${passed})`);
