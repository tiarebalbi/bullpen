import { describe, expect, it } from "vitest";
import { migrationPlan } from "./migration-plan.js";

const URL_VAR = { DATABASE_URL_MIGRATOR: "postgres://admin:pw@db.example.test/neondb" };

describe("migrationPlan", () => {
  it("runs on a production build that has the migrator URL", () => {
    expect(migrationPlan({ VERCEL_ENV: "production", ...URL_VAR })).toEqual({ action: "run" });
  });

  it("fails a production build with no migrator URL, saying which variable and why the deploy stops", () => {
    const plan = migrationPlan({ VERCEL_ENV: "production" });
    expect(plan.action).toBe("fail");
    expect(plan).toMatchObject({ reason: expect.stringContaining("DATABASE_URL_MIGRATOR") });
  });

  it("treats an empty migrator URL as missing", () => {
    expect(migrationPlan({ VERCEL_ENV: "production", DATABASE_URL_MIGRATOR: "" }).action).toBe("fail");
  });

  it("skips a preview build, even one that has the migrator URL: a preview must not change a database", () => {
    expect(migrationPlan({ VERCEL_ENV: "preview", ...URL_VAR })).toEqual({ action: "skip", reason: "a preview build does not migrate" });
    expect(migrationPlan({ VERCEL_ENV: "development" }).action).toBe("skip");
  });

  it("outside Vercel, runs when asked with the URL and fails without it: the manual command as it was", () => {
    expect(migrationPlan({ ...URL_VAR })).toEqual({ action: "run" });
    expect(migrationPlan({}).action).toBe("fail");
  });

  it("never puts the URL in the reason", () => {
    expect(JSON.stringify(migrationPlan({ VERCEL_ENV: "preview", ...URL_VAR }))).not.toMatch(/admin|pw|db\.example/);
  });
});
