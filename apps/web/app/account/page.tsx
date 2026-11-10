import type { Metadata } from "next";
import type { ReactNode } from "react";
import { readOwnHandle } from "@bullpen/db-handles";
import { currentPlayer } from "../lib/auth/player.js";
import { signInAvailable } from "../lib/auth/server.js";
import { handlesPool } from "../lib/handles/pool.js";
import { AccountScreen } from "../components/AccountScreen.js";
import type { OwnHandleView } from "../components/HandleForm.js";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Your account — Bullpen", robots: { index: false } };

export default async function AccountPage(): Promise<ReactNode> {
  const player = signInAvailable() ? await currentPlayer() : null;
  let own: OwnHandleView | null = null;
  let unavailable = false;
  if (player) {
    try {
      const read = await readOwnHandle(handlesPool(), player.userId);
      own = read ? { handle: read.handle, status: read.status } : null;
    } catch {
      unavailable = true;
    }
  }
  return <AccountScreen player={player} own={own} unavailable={unavailable} />;
}
