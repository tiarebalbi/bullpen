"use client";

import type { ReactNode } from "react";
import type { LeaderboardSnapshot } from "@bullpen/contracts";
import { approvedHandleOf, rankLabel } from "../lib/trading/terminalView.js";
import { useAccount } from "../lib/trading/useAccount.js";
import { usePolled } from "../lib/usePolled.js";
import { HeaderBar } from "./AppHeader.js";

/**
 * The frame the account and review screens sit in: the terminal's own card and header (Bullpen, the player's equity and rank, the toggles and the player chip), then the
 * page. The figures are read the way the terminal reads them, so a visitor who is not signed in sees the wordmark and the toggles only.
 */
export function PageFrame({ title, children }: { title: string; children: ReactNode }): ReactNode {
  const { state } = useAccount();
  const leaderboard = usePolled<LeaderboardSnapshot>("/api/leaderboard", 60_000, "Leaderboard unavailable.");
  const view = state.status === "ok" ? state.account : null;
  const snapshot = leaderboard.status === "ok" ? leaderboard.data : null;
  return (
    <div className="bp-app">
      <div className="bp-terminal bp-page">
        <header className="bp-terminal__header">
          <HeaderBar title={title} view={view} rank={rankLabel(snapshot, view ? view.label : null)} approvedHandle={approvedHandleOf(snapshot)} />
        </header>
        <main className="bp-page__main">{children}</main>
      </div>
    </div>
  );
}
