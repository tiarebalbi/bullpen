/**
 * Checks, on a real connection with the real lifetime, what a client sees at the stream's planned close and on reconnect: that the stream ends itself before Hobby's
 * 300 s cut with a `bye` event, and that a reconnect with the last event id is sent a tick, not the prices again. Takes about as long as the stream lives (240-270 s).
 *
 *   tsx src/load/sse-cut.ts <base url, local only> [connections=3]
 */
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [base = "", countText = "3"] = process.argv.slice(2);
const host = base ? new URL(base).hostname : "";
if (!["127.0.0.1", "localhost"].includes(host)) {
  console.error("usage: tsx src/load/sse-cut.ts http://127.0.0.1:3100 [connections] (local only)");
  process.exit(1);
}

interface Seen { openedAt: number; closedAt: number; seconds: number; bye: boolean; events: Record<string, number>; lastId?: string; endedBy: string }
async function listen(lastEventId?: string, limitMs = 320_000): Promise<Seen> {
  const openedAt = Date.now();
  const response = await fetch(`${base}/api/prices/stream${lastEventId ? `?lastEventId=${encodeURIComponent(lastEventId)}` : ""}`, { signal: AbortSignal.timeout(limitMs) });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  const events: Record<string, number> = {};
  let text = "";
  let lastId: string | undefined;
  let endedBy = "closed by the server";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const blocks = text.split("\n\n");
      text = blocks.pop() ?? "";
      for (const block of blocks) {
        const name = /^event: (.+)$/m.exec(block)?.[1];
        if (name) events[name] = (events[name] ?? 0) + 1;
        const id = /^id: (.+)$/m.exec(block)?.[1];
        if (id) lastId = id;
      }
    }
  } catch {
    endedBy = "client timeout (300 s cut or network)";
  }
  const closedAt = Date.now();
  return { openedAt, closedAt, seconds: (closedAt - openedAt) / 1000, bye: (events.bye ?? 0) > 0, events, lastId, endedBy };
}

const count = Number(countText);
const first = await Promise.all(Array.from({ length: count }, () => listen()));
// A reconnect is checked for 12 s: long enough to see its first events, not another 4 minutes.
const resumed = await Promise.all(first.map((seen) => listen(seen.lastId, 12_000)));
const result = {
  at: new Date().toISOString(),
  connections: count,
  firstConnections: first.map(({ seconds, bye, events, endedBy }) => ({ seconds, bye, events, endedBy })),
  allEndedBeforeHobbyCut: first.every((s) => s.seconds < 300 && s.bye),
  longestSeconds: Math.max(...first.map((s) => s.seconds)),
  shortestSeconds: Math.min(...first.map((s) => s.seconds)),
  reconnectsWithLastEventId: resumed.map(({ seconds, events }) => ({ seconds, firstEventsOnReconnect: events })),
  reconnectSentPricesAgain: resumed.some((s) => (s.events.prices ?? 0) > 0),
};
mkdirSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "post-facts", "part-05-runs"), { recursive: true });
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "post-facts", "part-05-runs", "sse-300s-cut.json"), JSON.stringify(result, null, 1));
console.log(JSON.stringify(result, null, 1));
