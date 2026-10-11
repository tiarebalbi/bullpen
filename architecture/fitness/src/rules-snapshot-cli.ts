import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSnapshot, realDeps, writeSnapshot } from "./rules-snapshot.js";

// Usage: rules-snapshot --part <N> [--out architecture/reports]
// Runs every rule check once and writes architecture/reports/part-0N/. It
// never commits or pushes: the workflow (or I) does that, on a branch.
const args = process.argv.slice(2);
const option = (name: string): string | undefined => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};

const part = Number(option("--part") ?? process.env.SNAPSHOT_PART);
if (!Number.isInteger(part) || part < 1 || part > 6) {
  console.error("rules-snapshot: pass --part <1-6> (or set SNAPSHOT_PART).");
  process.exit(1);
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const out = join(repoRoot, option("--out") ?? join("architecture", "reports"));
const source = process.env.GITHUB_ACTIONS === "true" ? "github-actions" : "local";

const { snapshot, files } = buildSnapshot(repoRoot, part, realDeps(source));
const dir = writeSnapshot(out, snapshot, files);

for (const check of snapshot.checks) console.log(`${check.passed ? "pass" : "FAIL"}  ${check.name}: ${check.summary}`);
console.log(`\nWrote ${dir.slice(repoRoot.length + 1)}/ for ${snapshot.commit.slice(0, 7)}${snapshot.dirty ? " plus uncommitted changes" : ""} (${snapshot.passed ? "all checks passed" : "a check failed"}).`);
// A failing snapshot is still a real result and is still written; it just must not look like a success.
process.exit(snapshot.passed ? 0 : 1);
