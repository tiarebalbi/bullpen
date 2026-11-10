"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Panel } from "@bullpen/ui";

export interface OwnHandleView {
  handle: string;
  status: "pending" | "approved" | "review" | "rejected";
}

/** What the player is told about the handle they hold. Nothing here is shown to anyone else. */
export function statusLine(own: OwnHandleView | null, label: string): string {
  if (!own) return `You appear on the leaderboard as ${label}.`;
  if (own.status === "approved") return `${own.handle} is approved. It shows on the leaderboard at its next refresh.`;
  if (own.status === "rejected") return `${own.handle} was not approved, so you appear as ${label}. Choose another.`;
  if (own.status === "pending") return `${own.handle} is waiting to be checked. It shows on the leaderboard once it’s approved. Until then you appear as ${label}.`;
  return `${own.handle} is in review. It shows on the leaderboard once it’s approved. Until then you appear as ${label}.`;
}

const SAVED: Record<string, string> = {
  approved: "Approved. It shows on the leaderboard at its next refresh.",
  review: "Saved. It shows on the leaderboard once it’s approved.",
  pending: "Saved, but I could not finish checking it. Save it again to retry.",
};

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
      const body = (await response.json().catch(() => ({}))) as { status?: OwnHandleView["status"]; message?: string };
      if (!response.ok) {
        setError(body.message ?? "I could not save that. Try again in a moment.");
      } else {
        setOwn({ handle: text.trim(), status: body.status ?? "pending" });
        setNotice(SAVED[body.status ?? "pending"] ?? SAVED.pending!);
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
