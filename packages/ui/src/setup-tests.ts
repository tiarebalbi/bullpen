import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL doesn't auto-register cleanup unless vitest's `test.globals` is on
// (it isn't here — tests import from "vitest" explicitly), so it's
// wired up by hand. Without this, DOM from one test leaks into the
// next and assertions like "exactly one 'Live' text" become flaky.
afterEach(() => {
  cleanup();
});
