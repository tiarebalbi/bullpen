"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ConnectionIndicator, EmptyState, ErrorState, LeaderboardList, LeaderboardRow, Panel, Skeleton, formatTime, useNow } from "@bullpen/ui";
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

  if (state.status === "loading") {
    return (
      <Panel title="Leaderboard" aside={<ConnectionIndicator status="reconnecting" detail="loading" />}>
        <div style={{ display: "grid", gap: 14 }} aria-hidden="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} width="100%" height={40} />
          ))}
        </div>
      </Panel>
    );
  }
  if (state.status === "error") {
    return (
      <Panel title="Leaderboard">
        <ErrorState title="Leaderboard unavailable" description={state.message} />
      </Panel>
    );
  }

  const { snapshot } = state;
  const asOf = new Date(snapshot.asOf).getTime();
  // Age as the viewer sees it: the server's age at response time, then the time since, so it keeps counting between polls.
  const age = Math.max(snapshot.ageMs, now - asOf);
  const failedAt = snapshot.lastFailure ? new Date(snapshot.lastFailure.at).getTime() : null;

  return (
    <Panel title="Leaderboard" aside={<ConnectionIndicator status={snapshot.stale ? "stale" : "live"} detail={`as of ${formatTime(asOf)} · ${ageLabel(age)}`} />}>
      {failedAt !== null ? (
        <p className="bp-leaderboard__failed" data-testid="leaderboard-refresh-failed">
          The last refresh failed at {formatTime(failedAt)}; this is the last good ranking.
        </p>
      ) : null}
      {snapshot.rows.length === 0 ? (
        <EmptyState title="No players yet" description="The ranking appears here once the first account has a position or cash to count." />
      ) : (
        <LeaderboardList label="Players ranked by equity">
          {snapshot.rows.map((row) => (
            <LeaderboardRow key={row.accountId} rank={row.rank} handle={row.handle} equity={Number(row.equity)} cash={Number(row.cash)} />
          ))}
        </LeaderboardList>
      )}
    </Panel>
  );
}
