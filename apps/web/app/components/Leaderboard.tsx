"use client";

import type { ReactNode } from "react";
import { ConnectionIndicator, EmptyState, LeaderboardList, LeaderboardRow, Panel, Skeleton, formatTime, useNow } from "@bullpen/ui";
import type { LeaderboardSnapshot, LeaderboardViewer } from "@bullpen/contracts";
import type { Polled } from "../lib/usePolled.js";
import { Unavailable } from "./Unavailable.js";

/** "3 min ago", "45 s ago": the age the page shows next to the as-of time. */
export function ageLabel(ageMs: number): string {
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  return seconds < 90 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

/** Where the player's own handle stands, in words for them alone. Nothing for an approved handle or none: the row then says what it says to everyone. */
export function ownNote(viewer: LeaderboardViewer): string | undefined {
  const status = viewer.handle?.status;
  if (status === "pending" || status === "review") return "Your handle is waiting for review. Until it is approved you show as above.";
  if (status === "rejected") return "Your handle was not approved. Try another.";
  return undefined;
}

/** The link in the header: signed-in players only. "Change handle" once they have one, whatever its status, "Set your handle →" before. */
export function HandleLink({ viewer }: { viewer: LeaderboardViewer | undefined }): ReactNode {
  return (
    <a className="bp-leaderboard__handle-link" href="/account" data-testid="leaderboard-handle-link">
      {viewer?.handle ? "Change handle" : "Set your handle →"}
    </a>
  );
}

const VISITOR_LINE = "Players show as Player #### until they choose a handle and it’s approved.";

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
  const viewer = snapshot.viewer;
  // Signed in: the ranking says who is asking, or the page does (youLabel) when the ranking could not look the player up. Anyone else is a visitor.
  const signedIn = viewer !== undefined || youLabel !== null;
  const mine = (row: LeaderboardSnapshot["rows"][number]): boolean => (viewer ? row.accountId === viewer.accountId : youLabel !== null && row.handle === youLabel);

  return (
    <Panel
      title="Leaderboard"
      aside={
        <span className="bp-leaderboard__aside">
          {signedIn ? <HandleLink viewer={viewer} /> : null}
          <ConnectionIndicator status={snapshot.stale ? "stale" : "live"} detail={`as of ${formatTime(asOf)} · ${ageLabel(age)}`} />
        </span>
      }
    >
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
              <LeaderboardRow key={row.accountId} rank={row.rank} handle={row.handle} equity={Number(row.equity)} cash={Number(row.cash)} you={mine(row)} note={viewer && mine(row) ? ownNote(viewer) : undefined} />
            ))}
          </LeaderboardList>
          {hidden > 0 ? <p className="bp-leaderboard__more">Showing the top {snapshot.rows.length} of {snapshot.total} players.</p> : null}
        </>
      )}
      {signedIn ? null : <p className="bp-leaderboard__more" data-testid="leaderboard-visitor-line">{VISITOR_LINE}</p>}
    </Panel>
  );
}
