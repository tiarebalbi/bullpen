import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./Panel.js";

describe("Panel", () => {
  it("is a region named by its title, with an aside beside the heading", () => {
    render(<Panel title="Leaderboard" aside={<span>as of 14:02:11</span>}>content</Panel>);
    const region = screen.getByRole("region", { name: "Leaderboard" });
    expect(region).toHaveTextContent("content");
    expect(screen.getByRole("heading", { level: 2, name: "Leaderboard" })).toBeVisible();
    expect(screen.getByText("as of 14:02:11")).toBeVisible();
  });
});
