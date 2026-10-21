"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AccountView, ApiError } from "@bullpen/contracts";
import { isOpenState } from "./orderView.js";

/** While an order can still change the account is read this often; otherwise slowly, because nothing moves it but the player. */
export const OPEN_POLL_MS = 3_000;
export const IDLE_POLL_MS = 15_000;

export type AccountState =
  | { status: "loading" }
  | { status: "signed-out" }
  /** Sign-in is not available here (a preview, or not configured): there is no account to read. */
  | { status: "off"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; account: AccountView };

export const pollInterval = (account: AccountView | null): number => (account && account.orders.some((o) => isOpenState(o.state)) ? OPEN_POLL_MS : IDLE_POLL_MS);

export async function readAccount(fetcher: typeof fetch = fetch): Promise<AccountState> {
  try {
    const response = await fetcher("/api/orders", { cache: "no-store" });
    if (response.ok) return { status: "ok", account: (await response.json()) as AccountView };
    const body = (await response.json().catch(() => ({ message: "" }))) as Partial<ApiError>;
    if (response.status === 401) return { status: "signed-out" };
    if (body.error === "sign-in-unavailable") return { status: "off", message: body.message ?? "Sign-in is not available here." };
    return { status: "error", message: body.message || "I cannot reach your account right now." };
  } catch {
    return { status: "error", message: "I cannot reach your account right now." };
  }
}

/**
 * The player's account, polled: every 3 s while an order is open, every 15 s otherwise, not at all while the tab is hidden, and once at
 * once when it is shown again. `apply` takes an account a request already returned (a placed order), so the screen does not wait for a poll.
 */
export function useAccount(): { state: AccountState; apply: (account: AccountView) => void; refresh: () => void } {
  const [state, setState] = useState<AccountState>({ status: "loading" });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const alive = useRef(true);
  const run = useRef<() => void>(() => undefined);

  const schedule = useCallback((next: AccountState) => {
    if (timer.current) clearTimeout(timer.current);
    if (!alive.current || next.status === "signed-out" || next.status === "off") return; // nothing to poll for until the page is reloaded after a sign-in
    const wait = next.status === "ok" ? pollInterval(next.account) : IDLE_POLL_MS;
    timer.current = setTimeout(() => run.current(), wait);
  }, []);

  useEffect(() => {
    alive.current = true;
    run.current = () => {
      if (document.hidden) return schedule({ status: "loading" });
      void readAccount().then((next) => {
        if (!alive.current) return;
        setState(next);
        schedule(next);
      });
    };
    const onVisible = (): void => {
      if (!document.hidden) run.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    run.current();
    return () => {
      alive.current = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [schedule]);

  const apply = useCallback(
    (account: AccountView) => {
      const next: AccountState = { status: "ok", account };
      setState(next);
      schedule(next);
    },
    [schedule],
  );
  const refresh = useCallback(() => run.current(), []);
  return { state, apply, refresh };
}
