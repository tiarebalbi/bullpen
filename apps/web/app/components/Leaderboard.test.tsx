import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Leaderboard, ageLabel } from "./Leaderboard.js";

const respond = (body: unknown, ok = true, status = 200) => vi.fn().mockResolvedValue({ ok, status, json: async () => body });
const snapshot = (overrides = {}) => ({
  rows: [
    { accountId: "a1", handle: "ada", cash: "600", positionsValue: "400", equity: "1000", rank: 1 },
    { accountId: "a2", handle: "grace", cash: "250.5", positionsValue: "0", equity: "250.5", rank: 2 },
  ],
  asOf: new Date().toISOString(),
  ageMs: 20_000,
  stale: false,
  lastFailure: null,
  ...overrides,
});

describe("Leaderboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows the ranking with its as-of time, and no stale or failure label when fresh", async () => {
    vi.stubGlobal("fetch", respond(snapshot()));
    render(<Leaderboard />);

    await waitFor(() => expect(screen.getByRole("list", { name: "Players ranked by equity" })).toBeInTheDocument());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText(/as of \d\d:\d\d:\d\d/)).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    expect(screen.queryByTestId("leaderboard-refresh-failed")).not.toBeInTheDocument();
  });

  it("labels a stale ranking and shows its age", async () => {
    vi.stubGlobal("fetch", respond(snapshot({ stale: true, ageMs: 7 * 60_000, asOf: new Date(Date.now() - 7 * 60_000).toISOString() })));
    render(<Leaderboard />);

    await waitFor(() => expect(screen.getByText("Stale")).toBeInTheDocument());
    expect(screen.getByText(/7 min ago/)).toBeInTheDocument();
  });

  it("says the last refresh failed and that the ranking is the last good one", async () => {
    vi.stubGlobal("fetch", respond(snapshot({ stale: true, lastFailure: { at: new Date().toISOString(), error: "boom" } })));
    render(<Leaderboard />);

    await waitFor(() => expect(screen.getByTestId("leaderboard-refresh-failed")).toHaveTextContent("this is the last good ranking"));
    expect(screen.getByRole("list", { name: "Players ranked by equity" })).toBeInTheDocument();
  });

  it("shows the empty state, not placeholder players, when nobody has an account", async () => {
    vi.stubGlobal("fetch", respond(snapshot({ rows: [] })));
    render(<Leaderboard />);

    await waitFor(() => expect(screen.getByText("No players yet")).toBeInTheDocument());
    expect(screen.queryByRole("list", { name: "Players ranked by equity" })).not.toBeInTheDocument();
  });

  it("shows an error state when the route fails", async () => {
    vi.stubGlobal("fetch", respond({ error: "Leaderboard unavailable." }, false, 503));
    render(<Leaderboard />);

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Leaderboard unavailable"));
  });
});

describe("ageLabel", () => {
  it("counts seconds under a minute and a half, minutes after", () => {
    expect(ageLabel(20_000)).toBe("20 s ago");
    expect(ageLabel(89_000)).toBe("89 s ago");
    expect(ageLabel(7 * 60_000)).toBe("7 min ago");
    expect(ageLabel(-5)).toBe("0 s ago");
  });
});
