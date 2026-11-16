import type { Violation } from "./violation.js";

const CHECK = "sweep workflow";
const ADR = "ADR-0033";

/**
 * The scheduled sweep (ADR-0033) runs the sweeper against production from GitHub Actions, so what it may do is held to a short list a failing build can name:
 * it runs `main` only, writes nothing, ends by itself, can be switched off with no commit, stops on its end date, and never carries the token or the URL as text.
 * It reads the file as text: a line that is commented out does not count.
 */
export function checkSweepWorkflow(text: string, where = ".github/workflows/sweep.yml"): Violation[] {
  const code = text.split("\n").filter((line) => !/^\s*#/.test(line)).join("\n");
  const fail = (rule: string, why: string, fix: string): Violation => ({ check: CHECK, rule, where, why: `${why} (${ADR}).`, fix });
  const found: Violation[] = [];

  if (!/^\s*ref:\s*main\s*$/m.test(code)) {
    found.push(fail("the sweep checks out main", "Without `ref: main` a scheduled run would use whatever branch GitHub picks, and a branch could then run against production", "Add `ref: main` to the checkout step."));
  }
  if (!/^permissions:\s*\{\}\s*$/m.test(code) || /:\s*write\b/.test(code)) {
    found.push(fail("the sweep has no permissions and no write access", "The job needs nothing from the repository beyond a checkout, so any grant is more than it needs", "Set `permissions: {}` at the top and remove every `write`."));
  }
  if (!/^\s*timeout-minutes:\s*\d+\s*$/m.test(code)) {
    found.push(fail("the sweep job has a timeout", "A hung job would hold the `sweep` concurrency group and every later run would wait behind it", "Add `timeout-minutes: 6` to the job."));
  }
  if (!/\btimeout\s+--signal=TERM\s+\d+\s+node\s+apps\/sweeper\/src\/main\.ts/.test(code)) {
    found.push(fail("the sweeper runs under `timeout --signal=TERM`", "The sweeper loops until it is told to stop, so without a hard limit one run would overlap the next", "Run `timeout --signal=TERM 280 node apps/sweeper/src/main.ts`."));
  }
  if (!/\bif:\s*vars\.SWEEP_FROM_ACTIONS\s*==\s*'on'/.test(code)) {
    found.push(fail("the sweep runs only while SWEEP_FROM_ACTIONS is on", "The owner stops the stopgap by deleting the variable, with no commit, so the job must be gated on it", "Add `if: vars.SWEEP_FROM_ACTIONS == 'on'` to the job."));
  }
  if (!/2026-12-01/.test(code) || !/date -u/.test(code)) {
    found.push(fail("the sweep stops on 2026-12-01 UTC", "The quota resets then, and a forgotten workflow must not outlive it", "Add a step that compares `date -u +%F` with 2026-12-01 and skips every later step."));
  }
  for (const [i, line] of code.split("\n").entries()) {
    if (/SWEEPER_TOKEN\s*:/.test(line) && !/\$\{\{\s*secrets\.SWEEPER_TOKEN\s*\}\}/.test(line)) {
      found.push({ ...fail("the token is only ever secrets.SWEEPER_TOKEN", "A token written in the file, or taken from anywhere else, is in the repository's history", "Set `SWEEPER_TOKEN: ${{ secrets.SWEEPER_TOKEN }}`."), where: `${where}:${i + 1}` });
    }
    if (/SWEEPER_TARGET_URL\s*:/.test(line) && !/\$\{\{\s*vars\.SWEEPER_TARGET_URL\s*\}\}/.test(line)) {
      found.push({ ...fail("the target URL is only ever vars.SWEEPER_TARGET_URL", "The production address belongs in a repository variable, not in a file that is read by everyone", "Set `SWEEPER_TARGET_URL: ${{ vars.SWEEPER_TARGET_URL }}`."), where: `${where}:${i + 1}` });
    }
    if (/https?:\/\/|\/api\/internal\/sweep/.test(line)) {
      found.push({ ...fail("the sweep file holds no URL as text", "A URL written here is the production address in the repository's history", "Remove it and read the address from `vars.SWEEPER_TARGET_URL`."), where: `${where}:${i + 1}` });
    }
    if (/\bsecrets\.(?!SWEEPER_TOKEN\b)\w+/.test(line)) {
      found.push({ ...fail("the sweep reads no secret but SWEEPER_TOKEN", "Any other secret in this job is a credential the sweep does not need", "Remove it."), where: `${where}:${i + 1}` });
    }
  }
  return found;
}
