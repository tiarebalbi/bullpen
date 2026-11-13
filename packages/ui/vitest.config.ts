import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    // Vitest hands an empty string for any CSS file unless told otherwise; tokens.test.ts reads tokens.css as text to compute contrast.
    css: { include: [/tokens\.css/] },
    setupFiles: ["./src/setup-tests.ts"],
  },
});
