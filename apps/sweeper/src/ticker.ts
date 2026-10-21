/** What the sweeper reads from the sweep route's reply. The full shape is the SweepTick contract; a test holds the two together. */
export interface TickReply {
  open: number;
}

export interface TickerOptions {
  /** The sweep route's full URL. */
  url: string;
  token: string;
  /** Between calls while orders are open. */
  activeMs?: number;
  /** The longest wait between calls: idle, or after failures. */
  maxMs?: number;
  /** A call that takes longer than this is abandoned and counted as a failure. */
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Resolves after `ms`, or as soon as the signal aborts. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
  log?: (line: Record<string, unknown>) => void;
}

export const ACTIVE_MS = 5_000;
/** The longest wait while nothing is open. Every call reaches Postgres, and Neon suspends the compute only after 5 minutes without activity, so a shorter wait keeps it awake all month (ADR-0018, raised to 60 minutes by ADR-0021). */
export const MAX_MS = 60 * 60_000;
/** The longest wait after failures: shorter, so a transient failure heals quickly. */
export const FAILED_MAX_MS = 5 * 60_000;
export const TIMEOUT_MS = 20_000;

export const realSleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done);
  });

/** The wait before the next call: 5 s while orders are open, then doubling to the maximum while none are; failures double too, to a lower maximum. */
export function nextWait(previous: number, outcome: "open" | "idle" | "failed", activeMs = ACTIVE_MS, maxMs = MAX_MS, failedMaxMs = FAILED_MAX_MS): number {
  if (outcome === "open") return activeMs;
  return Math.min(Math.max(previous * 2, activeMs * 2), outcome === "failed" ? Math.min(failedMaxMs, maxMs) : maxMs);
}

const parse = (body: unknown): TickReply | null => {
  const open = (body as { open?: unknown } | null)?.open;
  return typeof open === "number" && Number.isInteger(open) && open >= 0 ? { open } : null;
};

/**
 * Calls the sweep route until the signal aborts. A call that fails (a status that is not 200, a body that is not the
 * contract, a network error, a timeout) is logged without the token and retried after a growing wait; the loop never gives up,
 * because the daemon is restarted if it exits and a restart loop would spend the quota doing nothing. Aborting the signal
 * abandons a call in flight: the route is idempotent, so the next sweep completes whatever it was doing.
 */
export async function run(options: TickerOptions, signal: AbortSignal): Promise<void> {
  const { url, token } = options;
  const activeMs = options.activeMs ?? ACTIVE_MS;
  const maxMs = options.maxMs ?? MAX_MS;
  const doFetch = options.fetch ?? fetch;
  const sleep = options.sleep ?? realSleep;
  const log = options.log ?? ((line) => console.log(JSON.stringify(line)));
  let wait = activeMs;
  let mode: "open" | "idle" | "failed" | "" = "";
  let calls = 0;

  while (!signal.aborted) {
    const started = Date.now();
    let outcome: "open" | "idle" | "failed" = "failed";
    let detail: Record<string, unknown>;
    try {
      const response = await doFetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS)]),
      });
      if (response.status !== 200) {
        detail = { status: response.status };
      } else {
        const reply = parse(await response.json().catch(() => null));
        if (reply) {
          outcome = reply.open > 0 ? "open" : "idle";
          detail = { open: reply.open };
        } else detail = { status: 200, problem: "the reply is not a sweep reply" };
      }
    } catch (error) {
      if (signal.aborted) return;
      detail = { problem: error instanceof Error ? error.name : "error" };
    }
    calls += 1;
    wait = nextWait(wait, outcome, activeMs, maxMs);
    if (outcome === "failed" || outcome !== mode || calls % 60 === 0) log({ at: new Date().toISOString(), outcome, ms: Date.now() - started, nextMs: wait, calls, ...detail });
    mode = outcome;
    await sleep(wait, signal);
  }
}
