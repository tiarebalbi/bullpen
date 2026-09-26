"use client";

import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * Variants ported from the "Button · Chip · Feedback" section of
 * Bullpen Design System.dc.html (~line 490): the ember pill CTA,
 * the panel-2 secondary, a transparent ghost link-button, and the
 * destructive (tinted red) action. Hover/focus/active states live in
 * styles.css (`.bp-btn`), since inline styles can't express them.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: ReactNode;
}

const BASE_STYLE: CSSProperties = {
  border: 0,
  cursor: "pointer",
  padding: "13px 22px",
  borderRadius: "var(--radius-pill)",
  font: "700 14px/1 var(--font-body)",
  fontFamily: "var(--font-body)",
};

const VARIANT_STYLE: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: "var(--ember)",
    color: "oklch(14% 0.048 238)",
  },
  secondary: {
    background: "var(--bp-panel-2)",
    color: "var(--foreground)",
  },
  ghost: {
    background: "transparent",
    color: "var(--foreground)",
    padding: "13px 16px",
  },
  destructive: {
    background: "color-mix(in oklch, var(--destructive) 16%, transparent)",
    color: "var(--destructive)",
  },
};

export function Button({ variant = "primary", className, style, disabled, ...props }: ButtonProps): ReactNode {
  return (
    <button
      {...props}
      disabled={disabled}
      className={["bp-btn", `bp-btn--${variant}`, className].filter(Boolean).join(" ")}
      style={{
        ...BASE_STYLE,
        ...VARIANT_STYLE[variant],
        ...(disabled
          ? { background: "var(--bp-panel-2)", color: "var(--foreground-muted)", cursor: "not-allowed" }
          : null),
        ...style,
      }}
    />
  );
}
