import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Chip } from "./Chip.js";

describe("Chip", () => {
  it("renders a non-interactive status chip as a span", () => {
    render(<Chip tone="gain">pass</Chip>);
    const chip = screen.getByText("pass");
    expect(chip.tagName).toBe("SPAN");
  });

  it("renders a toggle chip as a button with aria-pressed, and calls onClick", () => {
    const onClick = vi.fn();
    render(
      <Chip pressed={false} onClick={onClick}>
        Today
      </Chip>,
    );
    const chip = screen.getByRole("button", { name: "Today" });
    expect(chip).toHaveAttribute("aria-pressed", "false");
    chip.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("reflects the pressed state via aria-pressed", () => {
    render(
      <Chip pressed onClick={() => {}}>
        All time
      </Chip>,
    );
    expect(screen.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
  });
});
