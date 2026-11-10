import type { Metadata } from "next";
import type { ReactNode } from "react";
import { readOwnHandle } from "@bullpen/db-handles";
import { currentPlayer } from "../lib/auth/player.js";
import { signInAvailable } from "../lib/auth/server.js";
import { handlesPool } from "../lib/handles/pool.js";
import { HandleForm, type OwnHandleView } from "../components/HandleForm.js";

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
  return (
    <main className="bp-app">
      <h1>Your account</h1>
      <p><a href="/">Back to the terminal</a></p>
      {!player ? <p>Sign in with GitHub on the terminal to set a handle. Until you do, and until a handle is approved, you appear as “Player” and four characters.</p> : unavailable ? <p role="alert">Handles are not available right now. Try again in a moment.</p> : <HandleForm initial={own} label={player.label} />}
    </main>
  );
}
