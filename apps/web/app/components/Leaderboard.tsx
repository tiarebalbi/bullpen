"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ConnectionIndicator, EmptyState, ErrorState, fmt, formatTime, useNow } from "@bullpen/ui";
import type { LeaderboardSnapshot } from "@bullpen/contracts";

const POLL_INTERVAL_MS = 60_000;

type FetchState = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; snapshot: LeaderboardSnapshot };

/** "3 min ago", "45 s ago": the age the page shows next to the as-of time. */
export function ageLabel(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  return seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

export function Leaderboard(): ReactNode {
  const [state, setState] = useState<FetchState>({ status: "loading" });
  const now = useNow();

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const response = await fetch("/api/leaderboard");
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) setState({ status: "error", message: body.error ?? "Leaderboard unavailable." });
          return;
        }
        const snapshot = (await response.json()) as LeaderboardSnapshot;
        if (!cancelled) setState({ status: "ok", snapshot });
      } catch {
        if (!cancelled) setState({ status: "error", message: "Leaderboard unavailable." });
      }
    }
    void load();
    const id = setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (state.status === "loading") return <section aria-label="Leaderboard" className="bp-leaderboard"><ConnectionIndicator status="reconnecting" detail="loading" /></section>;
  if (state.status === "error") {
    return (
      <section aria-label="Leaderboard" className="bp-leaderboard">
        <ErrorState title="Leaderboard unavailable" description={state.message} />
      </section>
    );
  }

  const { snapshot } = state;
  const asOf = new Date(snapshot.asOf).getTime();
  // Age as the viewer sees it: the server's age at response time, then the time since, so it keeps counting between polls.
  const age = Math.max(snapshot.ageMs, now - asOf);
  const failedAt = snapshot.lastFailure ? new Date(snapshot.lastFailure.at).getTime() : null;

  return (
    <section aria-label="Leaderboard" className="bp-leaderboard">
      <h2>Leaderboard</h2>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <ConnectionIndicator status={snapshot.stale ? "stale" : "live"} detail={`as of ${formatTime(asOf)} · ${ageLabel(age)}`} />
        {failedAt !== null ? (
          <span data-testid="leaderboard-refresh-failed" style={{ font: "500 12px/1.3 var(--font-mono)", color: "var(--foreground-muted)" }}>
            The last refresh failed at {formatTime(failedAt)}; this is the last good ranking.
          </span>
        ) : null}
      </div>
      {snapshot.rows.length === 0 ? (
        <EmptyState title="No players yet" description="The ranking appears here once the first account has a position or cash to count." />
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Player</th>
              <th scope="col" style={{ textAlign: "right" }}>Equity</th>
              <th scope="col" style={{ textAlign: "right" }}>Cash</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.rows.map((row) => (
              <tr key={row.accountId}>
                <td>{row.rank}</td>
                <td>{row.handle}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(Number(row.equity))}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(Number(row.cash))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
