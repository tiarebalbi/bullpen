import { readFileSync } from "node:fs";
import { validateAllowances, validateUsage } from "@bullpen/contracts";

export interface AllowanceEntry {
  service: string;
  metric: string;
  allowance: number;
  unit: string;
  source_url: string;
  checked_on: string;
  note: string | null;
}

export interface UsageEntry {
  service: string;
  metric: string;
  value: number | null;
  unit: string;
}

export interface UsageSnapshot {
  week: string;
  period: { start: string; end: string };
  status: "pending" | "measured";
  note: string | null;
  usage: UsageEntry[];
}

function parseJson(content: string, sourceLabel: string): unknown {
  try {
    return JSON.parse(content);
  } catch (cause) {
    throw new Error(`${sourceLabel}: invalid JSON (${(cause as Error).message})`, { cause });
  }
}

/**
 * Parses and schema-validates `cost/allowances.json` via
 * `@bullpen/contracts`'s `validateAllowances`. Throws loudly on a schema
 * failure — this must never render a partially-invalid ledger.
 */
export function parseAllowances(content: string, sourceLabel = "cost/allowances.json"): AllowanceEntry[] {
  const data = parseJson(content, sourceLabel);
  const result = validateAllowances(data);
  if (!result.valid) {
    throw new Error(`${sourceLabel} failed schema validation:\n${result.errors}`);
  }
  return data as AllowanceEntry[];
}

/**
 * Parses and schema-validates a weekly usage snapshot (e.g.
 * `cost/usage/2026-w40.json`) via `@bullpen/contracts`'s `validateUsage`.
 */
export function parseUsage(content: string, sourceLabel = "cost/usage/2026-w40.json"): UsageSnapshot {
  const data = parseJson(content, sourceLabel);
  const result = validateUsage(data);
  if (!result.valid) {
    throw new Error(`${sourceLabel} failed schema validation:\n${result.errors}`);
  }
  return data as UsageSnapshot;
}

export function loadAllowances(filePath: string): AllowanceEntry[] {
  return parseAllowances(readFileSync(filePath, "utf8"), filePath);
}

export function loadUsage(filePath: string): UsageSnapshot {
  return parseUsage(readFileSync(filePath, "utf8"), filePath);
}

export interface UsageRow {
  entry: UsageEntry;
  allowance: AllowanceEntry;
}

/**
 * Pairs each usage entry with its real allowance (by service+metric) so
 * the Free-tier usage card never has to guess a cap. Throws if a usage
 * metric has no matching allowance -- a silently-missing cap would mean
 * either rendering no bar at all with no explanation, or a bar with a
 * fabricated one.
 */
export function joinUsageWithAllowances(allowances: AllowanceEntry[], usage: UsageSnapshot): UsageRow[] {
  return usage.usage.map((entry) => {
    const allowance = allowances.find((a) => a.service === entry.service && a.metric === entry.metric);
    if (!allowance) {
      throw new Error(`cost/allowances.json has no "${entry.service}"/"${entry.metric}" entry to pair with cost/usage's ${usage.week} snapshot`);
    }
    return { entry, allowance };
  });
}
