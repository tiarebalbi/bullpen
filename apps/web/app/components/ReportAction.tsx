"use client";

import { useState, type ReactNode } from "react";

type Step = "idle" | "confirming" | "sending" | "done";

/** A handle a player can have chosen: letters, digits, `_` and `-`. The neutral "Player ####" label has a space, so it is never one, and there is nothing to report on it. */
export const isChosenHandle = (shown: string): boolean => /^[A-Za-z0-9_-]{3,20}$/.test(shown);

/**
 * "Report" under another player's row: one click asks, a second sends. It sends the name as shown and nothing else (no reason, no text), says in words what happened,
 * and never says who reported. A person decides on /admin/handles; nothing changes for the reported player by this alone.
 */
export function ReportAction({ handle }: { handle: string }): ReactNode {
  const [step, setStep] = useState<Step>("idle");
  const [problem, setProblem] = useState<string | null>(null);

  async function send(): Promise<void> {
    setStep("sending");
    setProblem(null);
    try {
      const response = await fetch("/api/handle/report", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ handle }) });
      if (response.ok) {
        setStep("done");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      setProblem(body.message ?? "I could not record that. Try again in a moment.");
    } catch {
      setProblem("I could not reach the server. Try again in a moment.");
    }
    setStep("idle");
  }

  if (step === "done") return <span role="status" className="bp-report bp-report--done">Reported. A person will look.</span>;
  if (step === "idle") {
    return (
      <span className="bp-report">
        <button type="button" className="bp-report__button" aria-label={`Report ${handle}`} onClick={() => setStep("confirming")}>Report</button>
        {problem ? <span role="alert" className="bp-report__problem">{problem}</span> : null}
      </span>
    );
  }
  return (
    <span className="bp-report" role="group" aria-label={`Report ${handle}?`}>
      <span className="bp-report__ask">Report {handle}?</span>
      <button type="button" className="bp-report__button" disabled={step === "sending"} onClick={() => void send()}>{step === "sending" ? "Sending…" : "Yes, report"}</button>
      <button type="button" className="bp-report__button" disabled={step === "sending"} onClick={() => setStep("idle")}>Cancel</button>
    </span>
  );
}
