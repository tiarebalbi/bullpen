import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import { Leaderboard, ageLabel, ownNote } from "./Leaderboard.js";
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

  describe("handles", () => {
    const withViewer = (viewer: LeaderboardSnapshot["viewer"]): LeaderboardSnapshot =>
      snapshot({
        rows: [
          { accountId: "a1", handle: "ada", cash: "600", positionsValue: "400", equity: "1000", rank: 1 },
          { accountId: "a2", handle: "Player 4F2A", cash: "250.5", positionsValue: "0", equity: "250.5", rank: 2 },
        ],
        viewer,
      });
    const VISITOR = "Players show as Player #### until they choose a handle and it’s approved.";

    it("gives a visitor one line under the table, and no link", () => {
      render(<Leaderboard polled={ok(snapshot())} />);
      expect(screen.getByTestId("leaderboard-visitor-line")).toHaveTextContent(VISITOR);
      expect(screen.queryByTestId("leaderboard-handle-link")).not.toBeInTheDocument();
      expect(screen.queryByText("You")).not.toBeInTheDocument();
    });

    it("gives a signed-in player a link to set a handle, and no visitor line", () => {
      render(<Leaderboard polled={ok(withViewer({ accountId: "a2", handle: null }))} youLabel="Player 4F2A" />);
      const link = screen.getByTestId("leaderboard-handle-link");
      expect(link).toHaveTextContent("Set your handle →");
      expect(link).toHaveAttribute("href", "/account");
      expect(screen.queryByTestId("leaderboard-visitor-line")).not.toBeInTheDocument();
    });

    it("says 'Change handle' once the player has one, in any status", () => {
      for (const status of ["approved", "review", "pending", "rejected"] as const) {
        const { unmount } = render(<Leaderboard polled={ok(withViewer({ accountId: "a2", handle: { status, approved: status === "approved" ? "grace" : null } }))} />);
        expect(screen.getByTestId("leaderboard-handle-link")).toHaveTextContent("Change handle");
        unmount();
      }
    });

    it("treats a signed-in player the ranking could not look up as signed in: a link, and no visitor line", () => {
      render(<Leaderboard polled={ok(snapshot())} youLabel="Player 4F2A" />);
      expect(screen.getByTestId("leaderboard-handle-link")).toHaveTextContent("Set your handle →");
      expect(screen.queryByTestId("leaderboard-visitor-line")).not.toBeInTheDocument();
    });

    it("marks the player's own row 'You', found by account, and no other row", () => {
      render(<Leaderboard polled={ok(withViewer({ accountId: "a2", handle: null }))} />);
      const [first, second] = screen.getAllByRole("listitem");
      expect(first).not.toHaveTextContent("You");
      expect(second).toHaveTextContent("You");
    });

    it("marks the row by account even when the approved handle is not the neutral label", () => {
      render(<Leaderboard polled={ok(withViewer({ accountId: "a1", handle: { status: "approved", approved: "ada" } }))} youLabel="Player 9999" />);
      const [first, second] = screen.getAllByRole("listitem");
      expect(first).toHaveTextContent("You");
      expect(second).not.toHaveTextContent("You");
    });

    it.each([
      ["review", "Your handle is waiting for review."],
      ["pending", "Your handle is waiting for review."],
      ["rejected", "Your handle was not approved. Try another."],
    ] as const)("tells the player alone, on their own row, where a %s handle stands", (status, text) => {
      render(<Leaderboard polled={ok(withViewer({ accountId: "a2", handle: { status, approved: null } }))} />);
      const notes = screen.getAllByTestId("leaderboard-own-note");
      expect(notes).toHaveLength(1);
      expect(notes[0]).toHaveTextContent(text);
      expect(screen.getAllByRole("listitem")[1]).toContainElement(notes[0]!);
    });

    it("says nothing on the row for an approved handle or none: it reads as every other row", () => {
      for (const handle of [null, { status: "approved" as const, approved: "grace" }]) {
        const { unmount } = render(<Leaderboard polled={ok(withViewer({ accountId: "a2", handle }))} />);
        expect(screen.queryByTestId("leaderboard-own-note")).not.toBeInTheDocument();
        unmount();
      }
      expect(ownNote({ accountId: "a2", handle: null })).toBeUndefined();
    });

    it("never draws a handle that is not approved, to anyone: a second player and a visitor see only the neutral label and no status", () => {
      const SECRET = "SecretName99";
      // What the route sends: the ranking shows the neutral label for a handle in review, and only the owner's `viewer` knows its status. Neither carries the text.
      const board = snapshot({ rows: [{ accountId: "a1", handle: "Player 4F2A", cash: "1", positionsValue: "0", equity: "1", rank: 1 }, { accountId: "a2", handle: "Player 9C01", cash: "1", positionsValue: "0", equity: "1", rank: 2 }] });
      const asSecondPlayer = render(<Leaderboard polled={ok({ ...board, viewer: { accountId: "a2", handle: null } })} />);
      expect(asSecondPlayer.container.textContent).not.toContain(SECRET);
      expect(asSecondPlayer.container.textContent).not.toMatch(/waiting for review|not approved/);
      expect(screen.getAllByRole("listitem")[0]).not.toHaveTextContent("You");
      asSecondPlayer.unmount();
      const asVisitor = render(<Leaderboard polled={ok(board)} />);
      expect(asVisitor.container.textContent).not.toContain(SECRET);
      expect(asVisitor.container.textContent).not.toMatch(/waiting for review|not approved/);
      expect(screen.queryByTestId("leaderboard-own-note")).not.toBeInTheDocument();
    });
  });
});
