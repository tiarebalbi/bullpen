import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Violation } from "./violation.js";

const ROUTE_RELATIVE_PATH = "apps/web/app/api/price/[symbol]/route.ts";
const ALLOWANCES_RELATIVE_PATH = "cost/allowances.json";
const REVALIDATE_PATTERN = /export const REVALIDATE_SECONDS = (\d+);/;

const CHECK = "budget";
const SERVICE = "coingecko-demo";
const METRIC = "monthly_calls";
const MAX_BUDGET_FRACTION = 0.9;
const MODELED_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

/** Recorded in ADR-0005 (there is no ADL line for it: it is about cost, not structure). */
export const BUDGET_RULE = "modeled monthly CoinGecko calls stay within 90% of the Demo plan's monthly allowance";

export interface AllowanceEntry {
  service: string;
  metric: string;
  allowance: number;
  unit: string;
}

/**
 * Reads apps/web's real price route source and extracts its actual
 * configured REVALIDATE_SECONDS constant -- never an assumed or hardcoded
 * value, matching this fitness-check package's other checks (real fs
 * reads against the real repo). Throws a plain Error if the route or the
 * constant is missing; `checkBudgetAt` turns that into a violation.
 */
export function readConfiguredRevalidateSeconds(repoRoot: string): number {
  const routePath = join(repoRoot, ROUTE_RELATIVE_PATH);
  let source: string;
  try {
    source = readFileSync(routePath, "utf8");
  } catch (cause) {
    throw new Error(`${ROUTE_RELATIVE_PATH}: not found (budget check expects the price route to exist)`, { cause });
  }

  const match = REVALIDATE_PATTERN.exec(source);
  if (!match) {
    throw new Error(
      `${ROUTE_RELATIVE_PATH}: could not find "export const REVALIDATE_SECONDS = <number>;" -- budget check can't model call volume without it`,
    );
  }
  return Number(match[1]);
}

/**
 * Models monthly upstream calls from a cache interval (one call per
 * interval, worst case, sustained for MODELED_DAYS) and checks it against
 * MAX_BUDGET_FRACTION of the CoinGecko Demo monthly allowance in
 * cost/allowances.json (see ADR-0005). Lowering the route's cache interval
 * without also raising the allowance fails this check.
 */
export function checkBudget(revalidateSeconds: number, allowances: AllowanceEntry[]): Violation[] {
  const entry = allowances.find((a) => a.service === SERVICE && a.metric === METRIC);
  if (!entry) {
    return [
      {
        check: CHECK,
        rule: BUDGET_RULE,
        where: ALLOWANCES_RELATIVE_PATH,
        why: `${ALLOWANCES_RELATIVE_PATH} has no "${SERVICE}"/"${METRIC}" entry, so there is no allowance to model against (ADR-0005).`,
        fix: `Add {"service": "${SERVICE}", "metric": "${METRIC}", "allowance": 10000, "unit": "calls/month"} to ${ALLOWANCES_RELATIVE_PATH}.`,
      },
    ];
  }

  const modeledMonthlyCalls = (MODELED_DAYS * SECONDS_PER_DAY) / revalidateSeconds;
  const maxAllowedCalls = entry.allowance * MAX_BUDGET_FRACTION;
  if (modeledMonthlyCalls <= maxAllowedCalls) return [];

  return [
    {
      check: CHECK,
      rule: BUDGET_RULE,
      where: ROUTE_RELATIVE_PATH,
      why: `A ${revalidateSeconds}s cache interval models ${modeledMonthlyCalls.toFixed(0)} calls a month, over ${MAX_BUDGET_FRACTION * 100}% of the ${entry.allowance}-call allowance (max ${maxAllowedCalls.toFixed(0)}) (ADR-0005).`,
      fix: `Raise REVALIDATE_SECONDS in ${ROUTE_RELATIVE_PATH} until the modeled calls fit, or raise the allowance in ${ALLOWANCES_RELATIVE_PATH}.`,
    },
  ];
}

/** Reads the route and allowances under `repoRoot` and runs the budget check; unreadable inputs become violations. */
export function checkBudgetAt(repoRoot: string, allowances: AllowanceEntry[]): Violation[] {
  let revalidateSeconds: number;
  try {
    revalidateSeconds = readConfiguredRevalidateSeconds(repoRoot);
  } catch (error) {
    return [
      {
        check: CHECK,
        rule: BUDGET_RULE,
        where: ROUTE_RELATIVE_PATH,
        why: `The budget check cannot model call volume without the route's REVALIDATE_SECONDS: ${(error as Error).message.replace(/^[^:]+: /, "")} (ADR-0005).`,
        fix: `Export \`REVALIDATE_SECONDS = <seconds>;\` from ${ROUTE_RELATIVE_PATH}.`,
      },
    ];
  }
  return checkBudget(revalidateSeconds, allowances);
}
