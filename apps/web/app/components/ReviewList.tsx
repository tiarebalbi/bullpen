"use client";

import { useState, type ReactNode } from "react";
import { Button, EmptyState, Panel } from "@bullpen/ui";

export interface ReviewItem {
  handleId: string;
  handle: string;
  probability: number | null;
  reason: string;
  enqueuedAt: string;
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

export function ReviewList({ items }: { items: ReviewItem[] }): ReactNode {
  const [rows, setRows] = useState(items);
  const [failed, setFailed] = useState<string | null>(null);

  async function decide(id: string, action: "approve" | "reject"): Promise<void> {
    setFailed(null);
    const response = await fetch(`/api/admin/handles/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }).catch(() => null);
    if (response && (response.ok || response.status === 409)) setRows((current) => current.filter((row) => row.handleId !== id));
    else setFailed(id);
  }

  return (
    <Panel title="Handles in review">
      {rows.length === 0 ? (
        <EmptyState title="Nothing to review" description="A handle lands here when the model is not sure, or could not be asked." />
      ) : (
        <ul aria-label="Handles waiting for review">
          {rows.map((row) => (
            <li key={row.handleId}>
              <strong>{row.handle}</strong> <span>{probabilityLabel(row.probability)}</span> <span>({REASON[row.reason] ?? row.reason})</span>
              <Button variant="secondary" onClick={() => void decide(row.handleId, "approve")} aria-label={`Approve ${row.handle}`}>Approve</Button>
              <Button variant="destructive" onClick={() => void decide(row.handleId, "reject")} aria-label={`Reject ${row.handle}`}>Reject</Button>
              {failed === row.handleId ? <p role="alert">I could not record that. Try again.</p> : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
