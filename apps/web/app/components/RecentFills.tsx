"use client";

import type { ReactNode } from "react";
import { EmptyState, Panel } from "@bullpen/ui";
import type { AccountView } from "@bullpen/contracts";
import { fillLine } from "../lib/trading/terminalView.js";

/** The last ten booked fills, newest first: time, side, quantity, symbol, price. */
export function RecentFills({ view }: { view: AccountView }): ReactNode {
  return (
    <Panel title="Recent fills" label="Recent fills">
      {view.fills.length === 0 ? (
        <EmptyState title="Nothing filled yet" description="A fill shows up here the moment an order fills." />
      ) : (
        <ul className="bp-fills" aria-label="Recent fills">
          {view.fills.map((fill) => {
            const line = fillLine(fill);
            return (
              <li key={fill.fillId}>
                <time dateTime={fill.executedAt}>{line.time}</time>
                <span>{line.side} {line.quantity} {line.symbol}</span>
                <span className="bp-fills__price">@ {line.price}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
