import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Button } from "./Button.js";

describe("Button", () => {
  it("renders its label and responds to clicks", () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Join the live league</Button>);
    screen.getByRole("button", { name: "Join the live league" }).click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders each variant with its own class name", () => {
    (["primary", "secondary", "ghost", "destructive"] as const).forEach((variant) => {
      const { unmount } = render(<Button variant={variant}>Action</Button>);
      expect(screen.getByRole("button")).toHaveClass(`bp-btn--${variant}`);
      unmount();
    });
  });

  it("respects the native disabled attribute", () => {
    render(<Button disabled>Disabled</Button>);
    expect(screen.getByRole("button")).toBeDisabled();
  });
});
