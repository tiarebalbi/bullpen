import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommitPolicy } from "./commit-policy-check.js";
import { formatViolations } from "./violation.js";

// CI calls this with the pull request's base and head SHAs
// (github.event.pull_request.base.sha and .head.sha). The explicit head, not
// HEAD, matters: on a pull_request event HEAD is GitHub's synthetic merge
// commit, which is not one of the PR's own commits.
const base = process.env.BASE_SHA ?? process.argv[2];
const head = process.env.HEAD_SHA ?? process.argv[3] ?? "HEAD";

if (!base) {
  console.error("commit-policy: no base commit. Set BASE_SHA (and HEAD_SHA), or pass <base> [<head>].");
  process.exit(1);
}

/** A full SHA shortened to 7 characters; anything else (a ref name) left as it is. */
const short = (ref: string): string => (/^[0-9a-f]{40}$/.test(ref) ? ref.slice(0, 7) : ref);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

try {
  const { commits, violations } = runCommitPolicy(repoRoot, base, head);
  if (violations.length > 0) {
    console.error(formatViolations(violations));
    console.error(`\ncommit-policy failed: ${violations.length} of ${commits.length} commit(s) in ${short(base)}..${short(head)} break the rule`);
    process.exit(1);
  }
  console.log(`commit-policy passed: ${commits.length} commit(s) in ${short(base)}..${short(head)} checked`);
} catch (error) {
  // Fail closed: a range git cannot read (for example a shallow checkout) is not a pass.
  console.error(`commit-policy could not read ${base}..${head}: ${(error as Error).message}`);
  process.exit(1);
}
