"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, EmptyState, Panel } from "@bullpen/ui";

export interface ReviewItem {
  handleId: string;
  handle: string;
  probability: number | null;
  reason: string;
  enqueuedAt: string;
}

/** A handle saved as pending and never decided, for longer than the stuck threshold. */
export interface StuckRow {
  handleId: string;
  handle: string;
  submittedAt: string;
}

const REASON: Record<string, string> = {
  "below-threshold": "the model was not sure enough",
  timeout: "the model took too long",
  "rate-limited": "the model was rate limited",
  malformed: "the answer was not usable",
  "no-key": "moderation had no key",
  unavailable: "the model could not be reached",
};

export const probabilityLabel = (probability: number | null): string => (probability === null ? "no probability" : `p = ${probability.toFixed(3)}`);

/** How long ago, in plain words, for a stuck handle: "12 minutes", "3 hours". */
export function ageLabel(iso: string, now: Date = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000));
  return minutes < 120 ? `${minutes} minutes` : `${Math.floor(minutes / 60)} hours`;
}

type Action = "approve" | "reject" | "retry";

export function ReviewList({ items, stuck = [], stuckAfterMinutes = 10 }: { items: ReviewItem[]; stuck?: StuckRow[]; stuckAfterMinutes?: number }): ReactNode {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [stuckRows, setStuckRows] = useState(stuck);
  const [failed, setFailed] = useState<string | null>(null);

  async function act(id: string, action: Action, from: "review" | "stuck"): Promise<void> {
    setFailed(null);
    const response = await fetch(`/api/admin/handles/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    if (response && (response.ok || response.status === 409)) {
      if (from === "review") setRows((current) => current.filter((row) => row.handleId !== id));
      else setStuckRows((current) => current.filter((row) => row.handleId !== id));
      // A retry can put the handle in review: the server knows its probability and reason, so ask it for the lists again.
      if (action === "retry") router.refresh();
    } else setFailed(id);
  }

  return (
    <>
      <Panel title="Stuck pending">
        <p>Saved more than {stuckAfterMinutes} minutes ago and never decided, because the decision could not be recorded. Retry asks the model again.</p>
        {stuckRows.length === 0 ? (
          <EmptyState title="Nothing stuck" description={`A handle shows here when it has been pending for more than ${stuckAfterMinutes} minutes.`} />
        ) : (
          <ul aria-label="Handles stuck pending" className="bp-review">
            {stuckRows.map((row) => (
              <li key={row.handleId} className="bp-review__row">
                <strong className="bp-review__who">{row.handle}</strong> <span className="bp-review__meta">pending for {ageLabel(row.submittedAt)}</span>
                <span className="bp-review__actions">
                  <Button variant="secondary" onClick={() => void act(row.handleId, "retry", "stuck")} aria-label={`Retry ${row.handle}`}>Retry</Button>
                  <Button variant="secondary" onClick={() => void act(row.handleId, "approve", "stuck")} aria-label={`Approve ${row.handle}`}>Approve</Button>
                  <Button variant="destructive" onClick={() => void act(row.handleId, "reject", "stuck")} aria-label={`Reject ${row.handle}`}>Reject</Button>
                </span>
                {failed === row.handleId ? <p role="alert">I could not record that. Try again.</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="Handles in review">
        {rows.length === 0 ? (
          <EmptyState title="Nothing to review" description="A handle lands here when the model is not sure, or could not be asked about it." />
        ) : (
          <ul aria-label="Handles waiting for review" className="bp-review">
            {rows.map((row) => (
              <li key={row.handleId} className="bp-review__row">
                <strong className="bp-review__who">{row.handle}</strong> <span className="bp-review__meta"><span>{probabilityLabel(row.probability)}</span> <span>({REASON[row.reason] ?? row.reason})</span></span>
                <span className="bp-review__actions">
                  <Button variant="secondary" onClick={() => void act(row.handleId, "approve", "review")} aria-label={`Approve ${row.handle}`}>Approve</Button>
                  <Button variant="destructive" onClick={() => void act(row.handleId, "reject", "review")} aria-label={`Reject ${row.handle}`}>Reject</Button>
                </span>
                {failed === row.handleId ? <p role="alert">I could not record that. Try again.</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  );
}
