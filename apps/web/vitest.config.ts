import { defineConfig } from "vitest/config";

export default defineConfig({
  // apps/web's tsconfig.json sets "jsx": "preserve" (Next's own compiler
  // does the JSX transform at build time), but Vite 8's default oxc
  // transform reads that same tsconfig and, left alone, leaves .tsx test
  // files untransformed -- a raw JSX parse error. Overriding it here only
  // affects the Vitest/Vite pipeline, not the Next build.
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./setup-tests.ts"],
    // Scope Vitest to unit/component tests only. Playwright's default
    // testDir (./e2e here) has its own *.spec.ts files, and without this
    // include Vitest would otherwise also try (and fail) to collect them.
    include: ["app/**/*.test.{ts,tsx}"],
    // The Neon Auth SDK imports `next/headers` without an extension, which Node cannot resolve outside Next. Inlined, Vite resolves it and a test
    // can mock the request's cookies while the SDK's own session code stays real (app/lib/auth/player.test.ts).
    server: { deps: { inline: ["@neondatabase/auth"] } },
  },
});
