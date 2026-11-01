import { afterEach, beforeEach, vi } from "vitest";
import { GATEWAY_ORIGIN } from "./app/lib/moderation/gateway.js";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// RTL doesn't auto-register cleanup unless vitest's `test.globals` is on
// (it isn't here — tests import from "vitest" explicitly), so it's
// wired up by hand. Without this, DOM from one test leaks into the
// next and assertions like "exactly one 'Live' text" become flaky.
afterEach(() => {
  cleanup();
});

// No test reaches the real AI Gateway, whatever key the environment holds (a preview has one). A test that exercises moderation passes its own fetch or
// mocks the gateway module; one that forgets fails here, loudly, instead of sending a handle to a provider.
const realFetch = globalThis.fetch;
beforeEach(() => {
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith(GATEWAY_ORIGIN)) return Promise.reject(new Error("a test tried to reach the real AI Gateway: mock fetch or the gateway module"));
    return realFetch(input, init);
  });
});
