import { defineConfig } from "vitest/config";

// The database tests need a real Postgres: `pnpm test:db` runs them (vitest.db.config.ts).
//
// testTimeout is 30 s, not vitest's default 5 s. Several tests run a check over the real repository (data ownership, moderation rules, imports, secrets), and each walks
// every source file under apps and packages. Alone that takes about a second; in CI, turbo runs every package's tests and builds at the same time on one runner, and a scan
// has taken more than 5 s there and failed with "Test timed out in 5000ms" although nothing it checks had changed (seen on three CI runs). A longer limit changes no assertion.
export default defineConfig({ test: { testTimeout: 30_000, exclude: ["**/node_modules/**", "**/*.int.test.ts"] } });
