import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig keeps JSX for Next to compile, and Vite's oxc transform reads that
  // same tsconfig and would leave a .tsx test untransformed. This only affects
  // the Vitest pipeline, not the Next build.
  oxc: { jsx: { runtime: "automatic" } },
  test: {
    environment: "node",
    // Scope Vitest to the loader unit tests only. Playwright's default
    // testDir (./e2e here) has its own *.spec.ts files, and without this
    // include Vitest would otherwise also try (and fail) to collect them.
    include: ["lib/**/*.test.ts", "app/lib/**/*.test.ts", "app/components/**/*.test.tsx"],
  },
});
