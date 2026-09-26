import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";

/**
 * An anchor twin of `@bullpen/ui`'s `Button`: same primary/secondary
 * visual treatment (ported from the same "ember pill" / "panel-2" styles
 * in Button.tsx), but rendering an `<a>` instead of a `<button>`, since
 * this app's CTAs navigate to in-page anchors rather than run a client
 * handler. Kept local to apps/landing rather than added to Button's own
 * props, since Button intentionally only accepts button attributes.
 */
export type LinkButtonVariant = "primary" | "secondary";

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: LinkButtonVariant;
  children: ReactNode;
}

const BASE_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  textDecoration: "none",
  border: 0,
  cursor: "pointer",
  padding: "16px 26px",
  borderRadius: "var(--radius-pill)",
  font: "700 15px/1 var(--font-body)",
  fontFamily: "var(--font-body)",
};

const VARIANT_STYLE: Record<LinkButtonVariant, CSSProperties> = {
  primary: { background: "var(--ember)", color: "oklch(14% 0.048 238)" },
  secondary: { background: "var(--bp-panel-2)", color: "var(--foreground)" },
};

export function LinkButton({ variant = "primary", className, style, children, ...props }: LinkButtonProps): ReactNode {
  return (
    <a
      {...props}
      className={["bp-btn", `bp-btn--${variant}`, className].filter(Boolean).join(" ")}
      style={{ ...BASE_STYLE, ...VARIANT_STYLE[variant], ...style }}
    >
      {children}
    </a>
  );
}
