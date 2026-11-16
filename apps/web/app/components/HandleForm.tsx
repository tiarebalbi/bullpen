"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Panel } from "@bullpen/ui";

export interface OwnHandleView {
  handle: string;
  status: "pending" | "approved" | "review" | "rejected" | "revoked";
}

/** What the player is told about the handle they hold. Nothing here is shown to anyone else. */
export function statusLine(own: OwnHandleView | null, label: string): string {
  if (!own) return `You appear on the leaderboard as ${label}.`;
  if (own.status === "approved") return `${own.handle} is approved. It shows on the leaderboard at its next refresh.`;
  if (own.status === "revoked") return `${own.handle} was taken down after a report, so you appear as ${label}. It cannot be used again. Choose another.`;
  if (own.status === "rejected") return `${own.handle} was not approved, so you appear as ${label}. Choose another.`;
  if (own.status === "pending") return `${own.handle} is waiting to be checked. It shows on the leaderboard once it’s approved. Until then you appear as ${label}.`;
  return `${own.handle} is in review. It shows on the leaderboard once it’s approved. Until then you appear as ${label}.`;
}

const SAVED: Record<string, string> = {
  approved: "Approved. It shows on the leaderboard at its next refresh.",
  review: "Saved. It shows on the leaderboard once it’s approved.",
  pending: "Saved, but I could not finish checking it. Save it again to retry.",
};

/** What a save tells the player: where the handle stands, or that no automatic check ran. */
export function savedNotice(status: OwnHandleView["status"] | undefined, moderation: "paused" | undefined): string {
  if (moderation === "paused") return MODERATION_PAUSED;
  return SAVED[status ?? "pending"] ?? SAVED.pending!;
}

/** The switch is off (ADR-0031): no model checked the handle, and a person reviews it. */
export const MODERATION_PAUSED = "Saved. Automatic checks are paused right now, so a person reviews every handle. It shows on the leaderboard once it’s approved.";

export function HandleForm({ initial, label }: { initial: OwnHandleView | null; label: string }): ReactNode {
  const [own, setOwn] = useState<OwnHandleView | null>(initial);
  const [text, setText] = useState(initial?.handle ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch("/api/handle", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle: text }) });
      const body = (await response.json().catch(() => ({}))) as { status?: OwnHandleView["status"]; message?: string; moderation?: "paused" };
      if (!response.ok) {
        setError(body.message ?? "I could not save that. Try again in a moment.");
      } else {
        setOwn({ handle: text.trim(), status: body.status ?? "pending" });
        setNotice(savedNotice(body.status, body.moderation));
      }
    } catch {
      setError("I could not reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel title="Your handle">
      <p>{statusLine(own, label)}</p>
      <form onSubmit={(event) => void submit(event)} aria-label="Set your handle" className="bp-page__body">
        <div className="bp-field">
          <label htmlFor="handle-input" className="bp-field__label">Handle</label>
          <input id="handle-input" name="handle" className="bp-input" value={text} onChange={(event) => setText(event.target.value)} autoComplete="off" spellCheck={false} aria-describedby="handle-help" aria-invalid={error ? true : undefined} />
          <p id="handle-help" className="bp-field__help">3 to 20 letters, digits, _ or -. A person or a model checks it before anyone else can see it.</p>
        </div>
        <div><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save handle"}</Button></div>
      </form>
      {error ? <p role="alert">{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </Panel>
  );
}
