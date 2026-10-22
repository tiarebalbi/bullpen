export type MigrationPlan = { action: "run" } | { action: "skip" | "fail"; reason: string };

/**
 * Whether a build or a manual run applies the migrations (ADR-0023). A production build must: with no migrator URL it fails, so a deploy never goes
 * live against a schema that is behind. A preview build never does. Anywhere else (a machine, CI) the command does what it always did: runs with
 * the URL, refuses without it. The URL itself never appears in a reason.
 */
export function migrationPlan(env: Record<string, string | undefined>): MigrationPlan {
  const target = env.VERCEL_ENV;
  if (target !== undefined && target !== "" && target !== "production") return { action: "skip", reason: `a ${target} build does not migrate` };
  if (env.DATABASE_URL_MIGRATOR) return { action: "run" };
  return {
    action: "fail",
    reason: target === "production"
      ? "DATABASE_URL_MIGRATOR is not set for the Production environment, so the migrations cannot run and this deploy is stopped (ADR-0023)"
      : "set DATABASE_URL_MIGRATOR to the unpooled admin connection string",
  };
}
