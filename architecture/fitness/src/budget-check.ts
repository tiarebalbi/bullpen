import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROUTE_RELATIVE_PATH = join("apps", "web", "app", "api", "price", "[symbol]", "route.ts");
const REVALIDATE_PATTERN = /export const REVALIDATE_SECONDS = (\d+);/;

const SERVICE = "coingecko-demo";
const METRIC = "monthly_calls";
const MAX_BUDGET_FRACTION = 0.9;
const MODELED_DAYS = 30;
const SECONDS_PER_DAY = 86_400;

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
 * reads against the real repo).
 */
export function readConfiguredRevalidateSeconds(repoRoot: string): number {
  const routePath = join(repoRoot, ROUTE_RELATIVE_PATH);
  let source: string;
  try {
    source = readFileSync(routePath, "utf8");
  } catch (cause) {
    throw new Error(`${routePath}: not found (budget check expects the price route to exist)`, { cause });
  }

  const match = REVALIDATE_PATTERN.exec(source);
  if (!match) {
    throw new Error(
      `${routePath}: could not find "export const REVALIDATE_SECONDS = <number>;" -- budget check can't model call volume without it`,
    );
  }
  return Number(match[1]);
}

/**
 * Models monthly upstream calls from a cache interval (one call per
 * interval, worst case, sustained for MODELED_DAYS) and checks it against
 * MAX_BUDGET_FRACTION of the CoinGecko Demo monthly allowance in
 * cost/allowances.json (see ADR-0005). Returns a list of violation
 * messages, empty when compliant -- lowering the route's cache interval
 * without also raising the allowance fails this check.
 */
export function checkBudget(revalidateSeconds: number, allowances: AllowanceEntry[]): string[] {
  const entry = allowances.find((a) => a.service === SERVICE && a.metric === METRIC);
  if (!entry) {
    return [
      `cost/allowances.json has no "${SERVICE}"/"${METRIC}" entry -- budget check can't run without a real allowance figure`,
    ];
  }

  const modeledMonthlyCalls = (MODELED_DAYS * SECONDS_PER_DAY) / revalidateSeconds;
  const maxAllowedCalls = entry.allowance * MAX_BUDGET_FRACTION;

  if (modeledMonthlyCalls > maxAllowedCalls) {
    return [
      `Modeled monthly CoinGecko calls (${modeledMonthlyCalls.toFixed(0)}, from a ${revalidateSeconds}s cache interval over ${MODELED_DAYS} days) exceed ${MAX_BUDGET_FRACTION * 100}% of the Demo plan's ${entry.allowance} calls/month allowance (max allowed: ${maxAllowedCalls.toFixed(0)}). Raise apps/web's REVALIDATE_SECONDS or the allowance in cost/allowances.json.`,
    ];
  }

  return [];
}
