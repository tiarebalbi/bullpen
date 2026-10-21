"use server";

import { redirect } from "next/navigation";
import { neonAuth, signInAvailable } from "./server.js";

/** Starts the GitHub sign-in (the only provider) and sends the visitor to it. On a preview, or with sign-in unconfigured, it does nothing. */
export async function signInWithProvider(): Promise<void> {
  if (!signInAvailable()) return;
  const { data } = await (await neonAuth()).signIn.social({ provider: "github", callbackURL: "/" });
  if (data?.url) redirect(data.url);
}

export async function signOut(): Promise<void> {
  if (!signInAvailable()) return;
  await (await neonAuth()).signOut();
  redirect("/");
}
