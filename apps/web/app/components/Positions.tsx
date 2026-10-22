"use client";

import type { ReactNode } from "react";
import { EmptyState, Panel } from "@bullpen/ui";
import type { AccountView } from "@bullpen/contracts";
import { formatMoney, quantityLabel } from "../lib/trading/orderView.js";
import { positionLine } from "../lib/trading/terminalView.js";

const signedMoney = (value: number): string => `${value >= 0 ? "+" : "−"}${formatMoney(String(Math.abs(value)))}`;
const signedPercent = (value: number): string => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}%`;

/** The player's positions: quantity, average cost from the booked fills, the last price, value and profit or loss against cost. Cash and buying power sit in the header. */
export function Positions({ view }: { view: AccountView }): ReactNode {
  const lines = view.positions.map(positionLine);
  return (
    <Panel title="Positions" label="Positions" aside={<span className="bp-positions__cash">Cash {formatMoney(view.cash)} · Buying power {formatMoney(view.buyingPower)}</span>}>
      {lines.length === 0 ? (
        <EmptyState title="No positions yet" description="A position appears here once a buy fills." />
      ) : (
        <div className="bp-positions" role="region" aria-label="Positions table" tabIndex={0}>
          <table className="bp-account__positions">
            <caption className="bp-visually-hidden">Positions</caption>
            <thead>
              <tr>
                <th scope="col">Symbol</th>
                <th scope="col">Qty</th>
                <th scope="col">Avg cost</th>
                <th scope="col">Last</th>
                <th scope="col">Value</th>
                <th scope="col">P/L</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((p) => (
                <tr key={p.symbol}>
                  <th scope="row">{p.symbol}</th>
                  <td>{quantityLabel(p.quantity)}</td>
                  <td>{p.avgCost ? formatMoney(p.avgCost) : "—"}</td>
                  <td>{p.last ? formatMoney(p.last) : "No price"}</td>
                  <td>{p.value ? formatMoney(p.value) : "—"}</td>
                  <td data-tone={p.pl === null ? undefined : p.pl >= 0 ? "gain" : "loss"}>
                    {p.pl === null || p.plPercent === null ? "—" : (
                      <>
                        <span aria-hidden="true">{p.pl >= 0 ? "▲" : "▼"} </span>
                        {signedMoney(p.pl)} <span className="bp-positions__pct">{signedPercent(p.plPercent)}</span>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
