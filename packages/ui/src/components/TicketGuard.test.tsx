import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TicketGuard } from "./TicketGuard.js";

describe("TicketGuard", () => {
  it.each([
    ["waiting", "◌"],
    ["shortfall", "!"],
    ["stale", "◷"],
    ["closed", "☾"],
  ] as const)("the %s guard has its own glyph, announced as an alert", (kind, glyph) => {
    render(<TicketGuard kind={kind} title="A title">words</TicketGuard>);
    const guard = screen.getByRole("alert");
    expect(guard).toHaveAttribute("data-kind", kind);
    expect(guard).toHaveTextContent(glyph);
    expect(guard).toHaveTextContent("A title");
    expect(guard).toHaveTextContent("words");
  });

  it("hides the glyph from assistive technology, so the title carries the meaning", () => {
    render(<TicketGuard kind="closed" title="Stocks are closed" />);
    expect(screen.getByText("☾")).toHaveAttribute("aria-hidden", "true");
  });

  it("offers its fix as a button only when it has one", () => {
    const onClick = vi.fn();
    const { rerender } = render(<TicketGuard kind="shortfall" title="Over" action={{ label: "Set quantity to 3", onClick }} />);
    fireEvent.click(screen.getByRole("button", { name: "Set quantity to 3" }));
    expect(onClick).toHaveBeenCalledOnce();
    rerender(<TicketGuard kind="stale" title="Stale" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
