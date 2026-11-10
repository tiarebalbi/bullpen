import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LeaderboardList, LeaderboardRow, handleInitials } from "./LeaderboardRow.js";

describe("LeaderboardRow", () => {
  it("shows the rank, the handle, the equity and the cash in tabular figures", () => {
    render(
      <LeaderboardList label="Players ranked by equity">
        <LeaderboardRow rank={1} handle="ada" equity={1234.5} cash={1000} />
      </LeaderboardList>,
    );
    const row = within(screen.getByRole("list", { name: "Players ranked by equity" })).getByRole("listitem");
    expect(row).toHaveTextContent("1");
    expect(row).toHaveTextContent("ada");
    expect(row).toHaveTextContent("$1,234.50");
    expect(row).toHaveTextContent("cash $1,000.00");
    expect(screen.getByText("$1,234.50")).toHaveStyle({ fontVariantNumeric: "tabular-nums" });
  });

  it("marks the signed-in player's row in words, not colour", () => {
    render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={2} handle="grace" equity={10} cash={10} you />
      </LeaderboardList>,
    );
    expect(screen.getByText("You")).toBeVisible();
  });

  it("makes a monogram from the handle and hides it from assistive technology", () => {
    render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={1} handle="zz-lin" equity={1} cash={1} />
      </LeaderboardList>,
    );
    expect(screen.getByText("ZZ")).toHaveAttribute("aria-hidden", "true");
  });

  it("invents no gain or loss: the ranking carries no opening balance", () => {
    const { container } = render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={1} handle="ada" equity={1} cash={1} />
      </LeaderboardList>,
    );
    expect(container.textContent).not.toMatch(/[▲▼%]/);
  });

  it("with a full sentence, the short line is what is seen and the sentence is what is read and the tooltip, on one line", () => {
    render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={2} handle="Player 4F2A" equity={10} cash={10} you note="Handle in review" noteFull="Your handle is waiting for review. Until it is approved you show as above." />
      </LeaderboardList>,
    );
    const note = screen.getByTestId("leaderboard-own-note");
    expect(note.querySelector("[aria-hidden='true']")).toHaveTextContent("Handle in review");
    expect(note.querySelector(".bp-visually-hidden")).toHaveTextContent("Your handle is waiting for review. Until it is approved you show as above.");
    expect(note).toHaveAttribute("title", "Your handle is waiting for review. Until it is approved you show as above.");
    expect(note.style.whiteSpace).toBe("nowrap");
    expect(note.style.position).toBe("relative"); // the hidden sentence is absolutely positioned: it must stay in the row
  });

  it("gives the monogram tile a class a narrow column can hide, and keeps it out of the accessible tree", () => {
    const { container } = render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={1} handle="Player 4F2A" equity={10} cash={10} />
      </LeaderboardList>,
    );
    const tile = container.querySelector(".bp-leaderboard-row__avatar");
    expect(tile).toHaveAttribute("aria-hidden", "true");
  });

  it("shows a note under the name only when one is given, and says it in words", () => {
    const { rerender } = render(
      <LeaderboardList label="x">
        <LeaderboardRow rank={2} handle="Player 4F2A" equity={10} cash={10} you note="Waiting for review" />
      </LeaderboardList>,
    );
    expect(screen.getByTestId("leaderboard-own-note")).toHaveTextContent("Waiting for review");
    rerender(
      <LeaderboardList label="x">
        <LeaderboardRow rank={2} handle="Player 4F2A" equity={10} cash={10} />
      </LeaderboardList>,
    );
    expect(screen.queryByTestId("leaderboard-own-note")).not.toBeInTheDocument();
    expect(screen.queryByText("You")).not.toBeInTheDocument();
  });

  it("takes the monogram from the first two letters or digits, and a question mark from none", () => {
    expect(handleInitials("zz-lin")).toBe("ZZ");
    expect(handleInitials("_a9")).toBe("A9");
    expect(handleInitials("--")).toBe("?");
  });
});
