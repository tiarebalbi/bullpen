import type { AllowanceEntry, UsageSnapshot } from "./cost.js";
import { joinUsageWithAllowances } from "./cost.js";
import { SERVICE_ARRIVES_IN_PART, humanAllowance, metricLabel, serviceLabel } from "./costDisplay.js";

/**
 * Tracked in cost/allowances.json ahead of time, but used by nothing in Bullpen's plan: the landing does not list them, so the count it
 * shows and the list it opens agree. They stay in the ledger file (owner's decision, 2026-10-20).
 */
export const OFF_LANDING_SERVICES: ReadonlySet<string> = new Set(["upstash-redis", "aws-lambda"]);

/** The part in which the per-player cost estimate arrives: Part 5's moment is "Market open and the bill". No number is shown before it. */
export const PER_PLAYER_ESTIMATE_PART = 5;

/** The allowances the landing shows: the ledger without the services nothing uses. */
export function landingAllowances(all: readonly AllowanceEntry[]): AllowanceEntry[] {
  return all.filter((entry) => !OFF_LANDING_SERVICES.has(entry.service));
}

export interface CostRow {
  key: string;
  service: string;
  metric: string;
  allowance: string;
  sourceUrl: string;
  checkedOn: string;
  /** The part the service arrives in, if it is not in use yet. */
  arrivesInPart: number | null;
}

const inUse = (service: string, builtPart: number): boolean => {
  const arrives = SERVICE_ARRIVES_IN_PART[service];
  return arrives === undefined || arrives <= builtPart;
};

export interface CostView {
  /** How many allowances the card says it tracks: the number of rows in the list. */
  count: number;
  /** The latest date any of them was checked. */
  checkedOn: string;
  /** What runs today, then what arrives later, ordered by part. */
  rows: CostRow[];
  /** Spent this month: never a number the ledger does not hold. */
  spend: SpendView;
  /** "Arrives in Part 5". */
  perPlayer: string;
}

export interface SpendView {
  label: "pending";
  /** Why it is pending and what reads it. */
  caption: string;
}

/** Spend is read from the provider consoles, not computed: the ledger holds no dollar amount, so it says so and says whose number is missing. */
export function spendView(allowances: readonly AllowanceEntry[], usage: UsageSnapshot): SpendView {
  const billed = allowances.some((a) => a.service === "neon-launch");
  const unread = usage.usage.filter((u) => u.service.startsWith("neon") && u.value === null).length;
  const caption = billed
    ? `Neon is on its Launch plan, which bills by use${unread > 0 ? `, and its usage for ${usage.week} has not been read` : ""}. I read the amount from the console; nothing here is estimated.`
    : "Everything is on a free tier. I read the amount from the provider consoles; nothing here is estimated.";
  return { label: "pending", caption };
}

export function buildCostView(all: readonly AllowanceEntry[], usage: UsageSnapshot, builtPart: number): CostView {
  const allowances = landingAllowances(all);
  const order = (row: CostRow): number => (row.arrivesInPart === null ? 0 : row.arrivesInPart);
  const rows = allowances
    .map((entry): CostRow => ({
      key: `${entry.service}-${entry.metric}`,
      service: serviceLabel(entry.service),
      metric: metricLabel(entry.metric),
      allowance: humanAllowance(entry),
      sourceUrl: entry.source_url,
      checkedOn: entry.checked_on,
      arrivesInPart: inUse(entry.service, builtPart) ? null : (SERVICE_ARRIVES_IN_PART[entry.service] ?? null),
    }))
    .sort((a, b) => order(a) - order(b));
  return {
    count: rows.length,
    checkedOn: allowances.reduce((latest, a) => (a.checked_on > latest ? a.checked_on : latest), ""),
    rows,
    spend: spendView(allowances, usage),
    perPlayer: `Arrives in Part ${PER_PLAYER_ESTIMATE_PART}`,
  };
}

export interface UsageRowView {
  key: string;
  service: string;
  metric: string;
  /** "usage pending" until a snapshot has a reading; then "812,000 / 1,000,000 invocations a month". */
  reading: string;
  measured: boolean;
  checkedOn: string;
}

export interface UsageView {
  rows: UsageRowView[];
  week: string;
  period: string;
  status: UsageSnapshot["status"];
}

/** The free-tier usage rows for what runs today: each service in use, with its reading or "usage pending", and the date its allowance was checked. */
export function buildUsageView(all: readonly AllowanceEntry[], usage: UsageSnapshot, builtPart: number): UsageView {
  const allowances = landingAllowances(all);
  const rows = joinUsageWithAllowances(allowances, { ...usage, usage: usage.usage.filter((u) => !OFF_LANDING_SERVICES.has(u.service)) })
    .filter(({ allowance }) => inUse(allowance.service, builtPart))
    .map(({ entry, allowance }): UsageRowView => ({
      key: `${entry.service}-${entry.metric}`,
      service: serviceLabel(allowance.service),
      metric: metricLabel(entry.metric),
      reading: entry.value === null ? "usage pending" : `${entry.value.toLocaleString("en-US")} / ${humanAllowance(allowance)}`,
      measured: entry.value !== null,
      checkedOn: allowance.checked_on,
    }));
  return { rows, week: usage.week, period: `${usage.period.start} – ${usage.period.end}`, status: usage.status };
}
