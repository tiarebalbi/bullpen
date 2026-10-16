import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import { Leaderboard, ageLabel } from "./Leaderboard.js";
import type { Polled } from "../lib/usePolled.js";

const snapshot = (overrides: Partial<LeaderboardSnapshot> = {}): LeaderboardSnapshot => ({
  rows: [
    { accountId: "a1", handle: "ada", cash: "600", positionsValue: "400", equity: "1000", rank: 1 },
    { accountId: "a2", handle: "grace", cash: "250.5", positionsValue: "0", equity: "250.5", rank: 2 },
  ],
  total: 2,
  asOf: new Date().toISOString(),
  ageMs: 20_000,
  stale: false,
  lastFailure: null,
  ...overrides,
});
const ok = (data: LeaderboardSnapshot): Polled<LeaderboardSnapshot> => ({ status: "ok", data });

describe("Leaderboard", () => {
  it("shows the ranking with its as-of time, and no stale or failure label when fresh", () => {
    render(<Leaderboard polled={ok(snapshot())} />);
    expect(screen.getByRole("list", { name: "Players ranked by equity" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("ada")).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText(/as of \d\d:\d\d:\d\d/)).toBeInTheDocument();
    expect(screen.queryByText("Stale")).not.toBeInTheDocument();
    expect(screen.queryByTestId("leaderboard-refresh-failed")).not.toBeInTheDocument();
    expect(screen.queryByText(/Showing the top/)).not.toBeInTheDocument();
  });

  it("says it is showing the top of a longer ranking, and how long", () => {
    render(<Leaderboard polled={ok(snapshot({ total: 812 }))} />);
    expect(screen.getByText("Showing the top 2 of 812 players.")).toBeInTheDocument();
  });

  it("labels a stale ranking and shows its age", () => {
    render(<Leaderboard polled={ok(snapshot({ stale: true, ageMs: 7 * 60_000, asOf: new Date(Date.now() - 7 * 60_000).toISOString() }))} />);
    expect(screen.getByText("Stale")).toBeInTheDocument();
    expect(screen.getByText(/7 min ago/)).toBeInTheDocument();
  });

  it("says the last refresh failed and that the ranking is the last good one", () => {
    render(<Leaderboard polled={ok(snapshot({ stale: true, lastFailure: { at: new Date().toISOString(), error: "boom" } }))} />);
    expect(screen.getByTestId("leaderboard-refresh-failed")).toHaveTextContent("this is the last good ranking");
    expect(screen.getByRole("list", { name: "Players ranked by equity" })).toBeInTheDocument();
  });

  it("shows the empty state, not placeholder players, when nobody has an account", () => {
    render(<Leaderboard polled={ok(snapshot({ rows: [], total: 0 }))} />);
    expect(screen.getByText("No players yet")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Players ranked by equity" })).not.toBeInTheDocument();
  });

  it("shows placeholders that are not players while it loads", () => {
    render(<Leaderboard polled={{ status: "loading" }} />);
    expect(screen.getByText("Reconnecting")).toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("says the database is unavailable when the route answered 503", () => {
    render(<Leaderboard polled={{ status: "error", httpStatus: 503, message: "Leaderboard unavailable." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByRole("alert")).toHaveTextContent("did not answer");
  });

  it("says the leaderboard is unavailable, not the database, for any other failure", () => {
    render(<Leaderboard polled={{ status: "error", httpStatus: 500, message: "Leaderboard unavailable." }} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Leaderboard unavailable");
    expect(screen.getByRole("alert")).not.toHaveTextContent("Database unavailable");
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
