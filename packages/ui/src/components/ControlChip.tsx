import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import type { ArchControlChange } from "./ArchitectureExplorer.types.js";

/** "app-boundaries" becomes "App boundaries": the model's key made readable, with no wording of its own. */
export function controlLabel(key: string): string {
  const words = key.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
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

/**
 * The description sits in the flow, on its own line under the chips it belongs to, so it pushes what follows down instead of covering it:
 * a second chip is always reachable, with a mouse or a finger as well as the keyboard.
 */
const POPOVER_STYLE: CSSProperties = {
  flex: "0 0 100%",
  maxWidth: 360,
  boxSizing: "border-box",
  background: "var(--popover, var(--bp-panel))",
  color: "var(--foreground)",
  border: "1px solid var(--bp-hair)",
  borderRadius: 12,
  padding: 12,
  font: "400 13px/1.5 var(--font-body)",
};

type ElementRef<T extends HTMLElement> = { current: T | null };

/** Whether a press at `target` is outside the chip and its description, and not on another chip (that chip's own click handles it, see below). */
function pressIsOutside(target: Element, button: ElementRef<HTMLButtonElement>, popover: ElementRef<HTMLDivElement>): boolean {
  // Closing on a press on another chip would move that chip (the description above it goes) before its click lands.
  if (target.closest?.("[data-control-chip]")) return false;
  return !button.current?.contains(target) && !popover.current?.contains(target);
}

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
      if (pressIsOutside(event.target as Element, button, popover)) onOpenChange(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, onOpenChange, button, popover]);
}

/** When the description opens it is brought into view if it opened below the edge of what scrolls. */
function useReveal(open: boolean, popover: ElementRef<HTMLDivElement>): void {
  useEffect(() => {
    if (open) popover.current?.scrollIntoView?.({ block: "nearest" });
  }, [open, popover]);
}

/**
 * A control as a small chip. It is a button: click, tap, Enter or Space open
 * a description under the chips, with the control's description from the model and its key. Esc, a
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
  useReveal(open, popover);

  return (
    <>
      <button
        ref={button}
        type="button"
        data-control-chip
        style={CHIP_STYLE}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => onOpenChange(!open)}
      >
        {label}
      </button>
      <div ref={popover} id={popoverId} role="region" aria-label={label} hidden={!open} style={POPOVER_STYLE}>
        {control.description ? <div>{control.description}</div> : null}
        <code style={{ display: "block", marginTop: control.description ? 8 : 0, font: "500 11px/1.4 var(--font-mono)", color: "var(--foreground-muted)" }}>
          {control.key}
        </code>
      </div>
    </>
  );
}
