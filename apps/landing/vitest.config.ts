import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Scope Vitest to the loader unit tests only. Playwright's default
    // testDir (./e2e here) has its own *.spec.ts files, and without this
    // include Vitest would otherwise also try (and fail) to collect them.
    include: ["lib/**/*.test.ts", "app/lib/**/*.test.ts"],
  },
});
