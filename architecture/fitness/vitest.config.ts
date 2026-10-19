import { defineConfig } from "vitest/config";

// The database tests need a real Postgres: `pnpm test:db` runs them (vitest.db.config.ts).
export default defineConfig({ test: { exclude: ["**/node_modules/**", "**/*.int.test.ts"] } });
