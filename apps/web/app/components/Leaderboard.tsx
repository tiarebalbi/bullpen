"use client";

import type { ReactNode } from "react";
import { ConnectionIndicator, EmptyState, LeaderboardList, LeaderboardRow, Panel, Skeleton, formatTime, useNow } from "@bullpen/ui";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import type { Polled } from "../lib/usePolled.js";
import { Unavailable } from "./Unavailable.js";

/** "3 min ago", "45 s ago": the age the page shows next to the as-of time. */
export function ageLabel(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  return seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

export function Leaderboard({ polled, youLabel = null }: { polled: Polled<LeaderboardSnapshot>; youLabel?: string | null }): ReactNode {
  const now = useNow();

  if (polled.status === "loading") {
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
  if (polled.status === "error") {
    return (
      <Panel title="Leaderboard">
        <Unavailable httpStatus={polled.httpStatus} title="Leaderboard unavailable" message={polled.message} what="The ranking and its players" />
      </Panel>
    );
  }

  const snapshot = polled.data;
  const asOf = new Date(snapshot.asOf).getTime();
  // Age as the viewer sees it: the server's age at response time, then the time since, so it keeps counting between polls.
  const age = Math.max(snapshot.ageMs, now - asOf);
  const failedAt = snapshot.lastFailure ? new Date(snapshot.lastFailure.at).getTime() : null;
  const hidden = snapshot.total - snapshot.rows.length;

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
        <>
          <LeaderboardList label="Players ranked by equity">
            {snapshot.rows.map((row) => (
              <LeaderboardRow key={row.accountId} rank={row.rank} handle={row.handle} equity={Number(row.equity)} cash={Number(row.cash)} you={youLabel !== null && row.handle === youLabel} />
            ))}
          </LeaderboardList>
          {hidden > 0 ? <p className="bp-leaderboard__more">Showing the top {snapshot.rows.length} of {snapshot.total} players.</p> : null}
        </>
      )}
    </Panel>
  );
}
