import { defineConfig } from "vitest/config";

// Real Postgres, real roles and grants. One file at a time: the roles are cluster-wide.
export default defineConfig({
  test: {
    include: ["src/db-integration/**/*.int.test.ts"],
    globalSetup: ["src/db-integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
