import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionIndicator } from "./ConnectionIndicator.js";

// jsdom has no matchMedia; ConnectionIndicator only reads it to decide
// whether to loop the live-pulse/spinner CSS animation, not to decide
// what text to render, but it still needs to exist so the hook doesn't
// throw.
function installMatchMedia(matches = false): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("ConnectionIndicator — each state has its own visible text", () => {
  it("renders 'Live' text for the live state", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="live" />);
    expect(screen.getByText("Live")).toBeInTheDocument();
  });

  it("renders 'Stale' text for the stale state", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="stale" />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("renders 'Reconnecting' text for the reconnecting state", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="reconnecting" />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
  });

  it("renders 'Offline' text for the offline state", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="offline" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders 'Delayed' text for the delayed state", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="delayed" />);
    expect(screen.getByText("Delayed")).toBeInTheDocument();
  });

  it("renders every state's label as visible text, not only via color or class", () => {
    installMatchMedia();
    const statuses = ["live", "delayed", "stale", "reconnecting", "offline"] as const;
    const renderedTexts = statuses.map((status) => {
      const { unmount, container } = render(<ConnectionIndicator status={status} />);
      const text = container.textContent ?? "";
      unmount();
      return text;
    });
    // Every state's text must be unique — nothing collapses to the same
    // string that would force a screen-reader user to rely on color.
    expect(new Set(renderedTexts).size).toBe(statuses.length);
  });

  it("shows a caller-supplied detail alongside the state label", () => {
    installMatchMedia();
    render(<ConnectionIndicator status="reconnecting" detail="attempt 2 of 5" />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
    expect(screen.getByText("attempt 2 of 5")).toBeInTheDocument();
  });

  it("offers a retry action when offline", () => {
    installMatchMedia();
    const onRetry = vi.fn();
    render(<ConnectionIndicator status="offline" onRetry={onRetry} />);
    screen.getByText("Retry now").click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
