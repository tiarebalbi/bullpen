import type { Violation } from "./violation.js";

const CHECK = "sweep workflow";
const ADR = "ADR-0033";

/**
 * The scheduled sweep (ADR-0033) runs the sweeper against production from GitHub Actions, so what it may do is held to a short list a failing build can name:
 * it runs `main` only, writes nothing, ends by itself, can be switched off with no commit, stops on its end date, and never carries the token or the URL as text.
 * Its schedule is held to what the work needs (ADR-0033, the cut of 2026-11-16): no run more often than every 30 minutes, an open run that cannot outlive 20 minutes,
 * every run leaving when idle, and a hand run that can only be one of the two modes.
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
  if (!/^\s*timeout-minutes:\s*(\d+|\$\{\{.+\}\})\s*$/m.test(code)) {
    found.push(fail("the sweep job has a timeout", "A hung job would hold the `sweep` concurrency group and every later run would wait behind it", "Add `timeout-minutes: ${{ fromJSON(... && '17' || '4') }}` to the job."));
  }
  if (!/\btimeout\s+--signal=TERM\s+("\$limit"|\d+)\s+node\s+apps\/sweeper\/src\/main\.ts/.test(code)) {
    found.push(fail("the sweeper runs under `timeout --signal=TERM`", "The sweeper loops until it is told to stop, so without a hard limit one run would overlap the next", "Run `timeout --signal=TERM \"$limit\" node apps/sweeper/src/main.ts`, with limit set in the step."));
  }
  found.push(...checkLimits(code, fail));
  found.push(...checkSchedule(code, fail));
  found.push(...checkIdleExit(code, fail));
  found.push(...checkMode(code, fail));
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

type Fail = (rule: string, why: string, fix: string) => Violation;

interface Limits {
  /** Every `limit=N` in the run step: the `timeout` seconds. */
  seconds: number[];
  /** Every number the `timeout-minutes` line can give. */
  minutes: number[];
  /** The line is an expression that does not go through fromJSON, so GitHub would read a string. */
  notANumber: boolean;
}

/** What the file says the run may last: read as text, so a limit that is not written as a number is one the check cannot hold and says so. */
function readLimits(code: string): Limits {
  const line = /^\s*timeout-minutes:\s*(.+)$/m.exec(code)?.[1] ?? "";
  const isExpression = line.includes("${{");
  const quoted = [...line.matchAll(/'(\d+)'/g)].map((m) => Number(m[1]));
  return {
    seconds: [...code.matchAll(/\blimit=(\d+)\b/g)].map((m) => Number(m[1])),
    minutes: isExpression ? quoted : /^\d+$/.test(line.trim()) ? [Number(line.trim())] : [],
    notANumber: isExpression && !/fromJSON\(/.test(line),
  };
}

/** The open run's limits (ADR-0033): at most 20 minutes however it is written, and the sweeper's `timeout` ends before the job's own. */
function checkLimits(code: string, fail: Fail): Violation[] {
  const { seconds, minutes, notANumber } = readLimits(code);
  if (seconds.length === 0 || minutes.length === 0) {
    return [fail("the run's limits can be read", "The open run's limit has to be checked against 20 minutes, so both the `timeout` seconds and the job's minutes must be written as numbers the check can find", "Set `limit=900` and `limit=120` in the run step, and quote the minutes in the `timeout-minutes` expression.")];
  }
  const [longestRun, longestJob] = [Math.max(...seconds), Math.max(...minutes)];
  const problems: Array<[boolean, string, string, string]> = [
    [notANumber, "the job timeout is a number", "An expression without fromJSON gives GitHub a string, and the limit may then be ignored for the default of 360 minutes", "Write `timeout-minutes: ${{ fromJSON(... && '17' || '4') }}`."],
    [longestRun > 20 * 60, "the open run's time limit is at most 20 minutes", "An open run waits for the open and drains the queue; one that can run longer holds the `sweep` group and costs more than the cut allows", "Use at most 1200 seconds for `timeout` (900 is the open run's)."],
    [longestJob > 20, "the job timeout is at most 20 minutes", "A job limit over 20 minutes lets one hung run spend the month's minutes", "Use at most 20 in the `timeout-minutes` expression (17 and 4 are the runs')."],
    [longestRun >= longestJob * 60, "the sweeper's `timeout` ends before the job's", "If the job limit comes first, GitHub cancels the run, which reports a failure and loses the clean ending", "Keep the largest `limit` below the largest job minutes times 60 (900 s under 17 minutes)."],
  ];
  return problems.filter(([broken]) => broken).map(([, rule, why, fix]) => fail(rule, why, fix));
}

/** The values one cron part names: `*`, a number, a range, with an optional step (a step, a range or a number). */
function cronPart(part: string, max: number): number[] {
  const [range, step] = part.split("/");
  const [from, to] = range === "*" ? [0, max] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), step ? max : Number(range)];
  const values: number[] = [];
  for (let v = from!; v <= to!; v += step ? Number(step) : 1) values.push(v);
  return values;
}

/** Every value a cron field names, ascending: a list of parts. */
const cronField = (field: string, max: number): number[] => [...new Set(field.split(",").flatMap((part) => cronPart(part, max)))].sort((a, b) => a - b);

/** Every minute-of-day a cron's first two fields fire at. */
function cronMinutesOfDay(expression: string): number[] {
  const [minuteField, hourField] = expression.trim().split(/\s+/);
  const minutes = cronField(minuteField ?? "*", 59);
  return cronField(hourField ?? "*", 23).flatMap((h) => minutes.map((m) => h * 60 + m)).sort((a, b) => a - b);
}

/** The shortest gap between two firings of a cron, in minutes, across midnight too. A cron that fires once a day has a gap of a day. */
export function cronMinGapMinutes(expression: string): number {
  const times = cronMinutesOfDay(expression);
  if (times.length <= 1) return 24 * 60;
  return Math.min(...times.map((t, i) => (i === times.length - 1 ? times[0]! + 24 * 60 - t : times[i + 1]! - t)));
}

/** Every run leaves when idle: without it a run waits out its limit even with nothing open, which is the minutes the cut exists to save. */
function checkIdleExit(code: string, fail: Fail): Violation[] {
  if (/^\s*SWEEPER_EXIT_WHEN_IDLE:\s*"1"\s*$/m.test(code)) return [];
  return [fail("every run leaves when idle (SWEEPER_EXIT_WHEN_IDLE is 1)", "Without it a run waits out its whole time limit even when nothing is open, which is the minutes the cut exists to save", 'Set `SWEEPER_EXIT_WHEN_IDLE: "1"` in the run step\'s env.')];
}

function checkSchedule(code: string, fail: Fail): Violation[] {
  const crons = [...code.matchAll(/^\s*-\s*cron:\s*"([^"]+)"\s*$/gm)].map((m) => m[1]!);
  const found: Violation[] = [];
  if (crons.length === 0) found.push(fail("the sweep has a schedule", "Without a cron nothing admits the queue at the open", "Add the open run, the market-hours pass and the recovery pass."));
  for (const cron of crons) {
    const gap = cronMinGapMinutes(cron);
    if (gap < 30) {
      found.push(fail("no schedule runs more often than every 30 minutes", `The cron "${cron}" runs every ${gap} minutes; the cut to a few hundred minutes in all rests on runs that are far apart`, "Use `22 14 * * 1-5` for the open, `7,37 15-20 * * 1-5` in market hours and `17 */6 * * *` for recovery."));
    }
  }
  return found;
}

/** The hand run's modes are `single` and `open` and nothing else, and `single` is the default: an unknown mode would get a limit nobody chose. */
function checkMode(code: string, fail: Fail): Violation[] {
  const lines = code.split("\n");
  const start = lines.findIndex((l) => /^\s{6}mode:\s*$/.test(l));
  // The input's own lines: everything after `mode:` that is indented deeper than it.
  const block: string[] = [];
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (line.trim() !== "" && !/^\s{7,}/.test(line)) break;
    block.push(line);
  }
  const options = [...(/options:\s*\n((?:\s*-\s*\S+\s*\n?)+)/.exec(block.join("\n"))?.[1] ?? "").matchAll(/-\s*(\S+)/g)].map((m) => m[1]!);
  const found: Violation[] = [];
  if (options.length !== 2 || options.some((o) => o !== "single" && o !== "open") || new Set(options).size !== 2) {
    found.push(fail("the hand run's mode is single or open", `The mode input offers ${options.length === 0 ? "no choices" : `"${options.join('", "')}"`}; any other mode would get a limit nobody chose`, "Give `workflow_dispatch.inputs.mode` the choices `single` and `open`, and nothing else."));
  }
  if (!/default:\s*single\b/.test(block.join("\n"))) {
    found.push(fail("the hand run's mode defaults to single", "A hand run that defaults to the open run would wait for the open by accident", "Set `default: single` on the mode input."));
  }
  return found;
}
