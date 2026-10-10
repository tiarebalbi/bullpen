import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { ArchControlChange } from "./ArchitectureExplorer.types.js";

/** "app-boundaries" becomes "App boundaries": the model's key made readable, with no wording of its own. */
export function controlLabel(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const MARGIN = 8;
const GAP = 6;
const POPOVER_WIDTH = 320;

export interface Placement {
  left: number;
  top: number;
}

/**
 * Where a popover goes, in viewport coordinates: under its chip when it fits,
 * above when it only fits there, and always inside the viewport. The left edge
 * follows the chip, clamped so the whole popover stays on screen.
 */
export function placePopover(
  anchor: { left: number; top: number; bottom: number },
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): Placement {
  const left = Math.min(Math.max(anchor.left, MARGIN), Math.max(MARGIN, viewport.width - size.width - MARGIN));
  const below = anchor.bottom + GAP;
  const above = anchor.top - GAP - size.height;
  const fitsBelow = below + size.height <= viewport.height - MARGIN;
  const top = fitsBelow || above < MARGIN ? below : above;
  return { left, top: Math.min(Math.max(top, MARGIN), Math.max(MARGIN, viewport.height - size.height - MARGIN)) };
}

const CHIP_STYLE: CSSProperties = {
  font: "500 11.5px/1.2 var(--font-body)",
  color: "var(--foreground)",
  background: "color-mix(in oklch, var(--bp-gain) 10%, transparent)",
  border: "1px solid var(--bp-hair)",
  borderRadius: 9999,
  padding: "5px 10px",
  cursor: "pointer",
};

const POPOVER_STYLE: CSSProperties = {
  position: "fixed",
  zIndex: 70, // above the consent banner (60)
  width: `min(${POPOVER_WIDTH}px, calc(100vw - ${MARGIN * 2}px))`,
  boxSizing: "border-box",
  background: "var(--popover, var(--bp-panel))",
  color: "var(--foreground)",
  border: "1px solid var(--bp-hair)",
  borderRadius: 12,
  padding: 12,
  boxShadow: "0 12px 32px rgb(0 0 0 / 0.35)",
  font: "400 13px/1.5 var(--font-body)",
};

type ElementRef<T extends HTMLElement> = { current: T | null };

/** While `open`: Esc closes and gives focus back to the chip, and a press outside the chip and the popover closes. */
function useDismiss(open: boolean, onOpenChange: (open: boolean) => void, button: ElementRef<HTMLButtonElement>, popover: ElementRef<HTMLDivElement>): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      onOpenChange(false);
      button.current?.focus();
    };
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!button.current?.contains(target) && !popover.current?.contains(target)) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onOpenChange, button, popover]);
}

/** Where the open popover goes, kept inside the viewport as it resizes or scrolls; null while closed. */
function usePlacement(open: boolean, button: ElementRef<HTMLButtonElement>, popover: ElementRef<HTMLDivElement>): Placement | null {
  const [placement, setPlacement] = useState<Placement | null>(null);
  useLayoutEffect(() => {
    if (!open || !button.current || !popover.current) return;
    const place = (): void => {
      const anchor = button.current!.getBoundingClientRect();
      const size = { width: popover.current!.offsetWidth, height: popover.current!.offsetHeight };
      setPlacement(placePopover(anchor, size, { width: window.innerWidth, height: window.innerHeight }));
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, button, popover]);
  return open ? placement : null;
}

/**
 * A control as a small chip. It is a button: click, tap, Enter or Space open a
 * popover with the control's description from the model and its key. Esc, a
 * click outside or another chip closes it, and Esc gives focus back to the chip.
 */
export function ControlChip({
  control,
  open,
  onOpenChange,
}: {
  control: ArchControlChange;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): ReactNode {
  const popoverId = useId();
  const button = useRef<HTMLButtonElement>(null);
  const popover = useRef<HTMLDivElement>(null);
  const label = controlLabel(control.key);
  useDismiss(open, onOpenChange, button, popover);
  const placement = usePlacement(open, button, popover);

  return (
    <>
      <button
        ref={button}
        type="button"
        style={CHIP_STYLE}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </button>
      <div
        ref={popover}
        id={popoverId}
        role="region"
        aria-label={label}
        hidden={!open}
        style={{ ...POPOVER_STYLE, left: placement?.left ?? 0, top: placement?.top ?? 0, visibility: placement ? "visible" : "hidden" }}
      >
        {control.description ? <div>{control.description}</div> : null}
        <code style={{ display: "block", marginTop: control.description ? 8 : 0, font: "500 11px/1.4 var(--font-mono)", color: "var(--foreground-muted)" }}>
          {control.key}
        </code>
      </div>
    </>
  );
}
