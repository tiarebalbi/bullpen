import type { AllowanceEntry, UsageSnapshot } from "./cost.js";

/** Services Part 1 actually calls today: two Next.js apps on Vercel Hobby, and the price route's CoinGecko Demo API call. */
export const PART_1_SERVICES = new Set(["vercel-hobby", "coingecko-demo"]);

/**
 * Which later part first uses a service, sourced from the real committed
 * planned CALM files (grep architecture/calm/planned + content/architecture
 * for the node that owns each real dependency) -- never guessed:
 *  - neon: Part 3's Prices/Market History services each get a Neon Postgres database.
 *  - vercel-workflows: Part 4's order-saga-workflow.
 *  - vercel-queues: Part 5's market-open-queue.
 * upstash-redis, grafana-cloud and aws-lambda never appear in any real
 * committed CALM/architecture/ADR content -- they're tracked in
 * cost/allowances.json ahead of time, but aren't placed in the plan yet,
 * so they get no part number (never invented).
 */
export const SERVICE_ARRIVES_IN_PART: Record<string, number | undefined> = {
  neon: 3,
  "vercel-workflows": 4,
  "vercel-queues": 5,
};

const SERVICE_LABELS: Record<string, string> = {
  "vercel-hobby": "Vercel Hobby",
  "coingecko-demo": "CoinGecko Demo",
  neon: "Neon",
  "upstash-redis": "Upstash Redis",
  "grafana-cloud": "Grafana Cloud",
  "aws-lambda": "AWS Lambda",
  "vercel-queues": "Vercel Queues",
  "vercel-workflows": "Vercel Workflows",
};

const METRIC_LABELS: Record<string, string> = {
  active_cpu_time: "Active CPU",
  provisioned_memory: "Provisioned memory",
  function_memory_max: "Function memory (max)",
  function_max_duration: "Function duration (max)",
  function_invocations: "Function invocations",
  edge_requests: "Edge requests",
  deployments_per_day: "Deployments",
  monthly_calls: "Monthly calls",
  rate_limit: "Rate limit",
  api_operations: "API operations",
  workflow_events: "Workflow events",
  workflow_data_written: "Workflow data written",
  storage: "Storage",
  compute: "Compute",
  data_size: "Data size",
  monthly_commands: "Monthly commands",
  monthly_bandwidth: "Monthly bandwidth",
  metrics_active_series: "Active metric series",
  logs_ingest: "Log ingest",
  traces_ingest: "Trace ingest",
  requests: "Requests",
};

/** Every allowance's service/metric must have a human label -- throws rather than silently falling back to the raw id, so a new entry in cost/allowances.json can't ship unlabeled. */
export function serviceLabel(service: string): string {
  const label = SERVICE_LABELS[service];
  if (!label) throw new Error(`costDisplay.ts has no human label for service "${service}" -- add one`);
  return label;
}

export function metricLabel(metric: string): string {
  const label = METRIC_LABELS[metric];
  if (!label) throw new Error(`costDisplay.ts has no human label for metric "${metric}" -- add one`);
  return label;
}

// "4 hours/month" -> "4 hours a month"; "1000000 calls/month" -> "... a month"; "100 calls/min" -> "... a minute".
// Units with no recognized "/period" suffix (e.g. "GB per function (1 vCPU)") pass through unchanged.
export function humanUnit(unit: string): string {
  return unit.replace(/\/month$/, " a month").replace(/\/day$/, " a day").replace(/\/min$/, " a minute");
}

export function humanAllowance(entry: AllowanceEntry): string {
  return `${entry.allowance.toLocaleString("en-US")} ${humanUnit(entry.unit)}`;
}

export interface GroupedAllowance {
  service: string;
  label: string;
  arrivesInPart: number | undefined;
}

/** The later-arriving services, one line each, for the "Arrives in later parts" group -- de-duplicated by service, since each has 1-3 metric rows in cost/allowances.json. */
export function groupLaterServices(allowances: AllowanceEntry[]): GroupedAllowance[] {
  const seen = new Map<string, GroupedAllowance>();
  for (const entry of allowances) {
    if (PART_1_SERVICES.has(entry.service) || seen.has(entry.service)) continue;
    seen.set(entry.service, {
      service: entry.service,
      label: serviceLabel(entry.service),
      arrivesInPart: SERVICE_ARRIVES_IN_PART[entry.service],
    });
  }
  return Array.from(seen.values());
}

/** A reader sentence built from the real pending snapshot's own week/period, never a hardcoded date. */
export function pendingUsageNote(usage: UsageSnapshot): string | null {
  if (usage.status !== "pending") return null;
  const weekNumber = /w(\d+)/i.exec(usage.week)?.[1] ?? usage.week;
  const end = new Date(`${usage.period.end}T00:00:00Z`);
  const endLabel = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(end);
  return `Week ${weekNumber} closes on ${endLabel}. Its usage appears here after that; until then the numbers read "pending".`;
}
