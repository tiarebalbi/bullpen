import type { ReactNode } from "react";

/**
 * The order ticket's pre-confirm warning (Bullpen Design System, TicketGuard). One at a time, in priority order, each naming the fix; the caller chooses which applies
 * and changes the confirm label with it. Announced as an alert and appears without motion. Glyph and title carry the meaning, not the tint:
 *   waiting ◌ and stale ◷ in the warning tone, shortfall ! in the destructive tone, closed ☾ muted on the sunken surface.
 */
export type TicketGuardKind = "waiting" | "shortfall" | "stale" | "closed";

export interface TicketGuardProps {
  kind: TicketGuardKind;
  title: string;
  children?: ReactNode;
  /** The fix the guard offers, as a button ("Set quantity to 336"). Absent, there is none. */
  action?: { label: string; onClick: () => void };
}

const GLYPH: Record<TicketGuardKind, string> = { waiting: "◌", shortfall: "!", stale: "◷", closed: "☾" };

export function TicketGuard({ kind, title, children, action }: TicketGuardProps): ReactNode {
  return (
    <div className="bp-ticket__guard" role="alert" data-kind={kind} data-testid="ticket-guard">
      <span className="bp-ticket__guard-glyph" aria-hidden="true">{GLYPH[kind]}</span>
      <span className="bp-ticket__guard-title">{title}</span>
      {children ? <span className="bp-ticket__guard-text">{children}</span> : null}
      {action ? (
        <button type="button" className="bp-ticket__guard-action" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
