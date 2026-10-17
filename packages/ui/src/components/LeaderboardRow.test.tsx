import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { LeaderboardList, LeaderboardRow } from "./LeaderboardRow.js";

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
    expect(screen.getByText("you")).toBeVisible();
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
});
