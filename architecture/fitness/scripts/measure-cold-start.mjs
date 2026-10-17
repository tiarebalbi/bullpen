// Cold and warm timings of the routes that touch the database, against one fixed preview deployment.
//
//   PREVIEW_BASE=https://<deployment host> PREVIEW_SHARE=<share token> node scripts/measure-cold-start.mjs [--rounds 10] [--idle-minutes 20]
//
// Each round waits `idle-minutes` with no request, sends one request per route (cold), then three more (warm). Every request has a
// unique query string so the CDN cannot answer it. Prints JSON; never prints the token.
const base = process.env.PREVIEW_BASE;
const share = process.env.PREVIEW_SHARE;
if (!base || !share) {
  console.error("measure-cold-start: set PREVIEW_BASE and PREVIEW_SHARE.");
  process.exit(1);
}
const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? Number(process.argv[at + 1]) : fallback;
};
const ROUNDS = arg("rounds", 10);
const IDLE_MS = arg("idle-minutes", 20) * 60_000;
const ROUTES = ["/api/price/BTC-USD", "/api/leaderboard"];

let cookie = "";
async function authenticate() {
  const res = await fetch(`${base}/api/leaderboard?_vercel_share=${share}`, { redirect: "manual" });
  cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  if (!cookie) throw new Error("no auth cookie from the share link");
}
let counter = 0;
async function timed(route) {
  const started = performance.now();
  try {
    const res = await fetch(`${base}${route}?m=${Date.now()}-${counter++}`, { headers: { cookie } });
    await res.arrayBuffer();
    return { status: res.status, ms: Math.round(performance.now() - started) };
  } catch (error) {
    // A dropped connection is a failed request, counted as one; it must not end a three-hour run that keeps its numbers only at the end.
    return { status: 0, ms: Math.round(performance.now() - started), error: error?.cause?.code ?? "fetch failed" };
  }
}
const percentile = (xs, p) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
};

await authenticate();
const samples = Object.fromEntries(ROUTES.map((r) => [r, { cold: [], warm: [], failures: 0 }]));
for (let round = 1; round <= ROUNDS; round++) {
  await new Promise((resolve) => setTimeout(resolve, IDLE_MS));
  for (const route of ROUTES) {
    const bucket = samples[route];
    const cold = await timed(route);
    console.error(`  ${route} cold ${cold.status} ${cold.ms} ms${cold.error ? ` (${cold.error})` : ""}`);
    if (cold.status === 200) bucket.cold.push(cold.ms); else bucket.failures++;
    for (let i = 0; i < 3; i++) {
      const warm = await timed(route);
      console.error(`  ${route} warm ${warm.status} ${warm.ms} ms${warm.error ? ` (${warm.error})` : ""}`);
      if (warm.status === 200) bucket.warm.push(warm.ms); else bucket.failures++;
    }
  }
  console.error(`round ${round}/${ROUNDS} at ${new Date().toISOString()}`);
}
const report = Object.fromEntries(
  ROUTES.map((route) => {
    const { cold, warm, failures } = samples[route];
    return [route, { failures, cold: { n: cold.length, p50: percentile(cold, 50), p95: percentile(cold, 95), all: cold }, warm: { n: warm.length, p50: percentile(warm, 50), p95: percentile(warm, 95) } }];
  }),
);
console.log(JSON.stringify({ base: new URL(base).host, startedAt: new Date(Date.now() - ROUNDS * (IDLE_MS + 5000)).toISOString(), report }, null, 2));
