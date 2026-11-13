#!/usr/bin/env bash
# Every local load case of Part 5, one after another, each writing post-facts/part-05-runs/<label>.json.
# Needs: k6 (K6=/path/to/k6), a LOCAL throwaway Postgres cluster (TEST_DATABASE_URL), run from architecture/fitness.
# The database is held to a quarter of a core for the "-db0.25" runs by src/load/throttle.ts (an approximation of Neon's 0.25 CU, see its header).
set -uo pipefail
cd "$(dirname "$0")/.."
# SKIP="label label" leaves out runs already made and kept (a rerun after a harness fix).
run() { for l in ${SKIP:-}; do [[ " $* " == *" --label $l "* ]] && { echo "=== skipped $l"; return; }; done; echo "=== $* ($(date +%T))"; pnpm exec tsx src/load/run.ts "$@" > /dev/null 2>"${LOAD_SCRATCH:-/tmp}/last-error.log" || { echo "FAILED: $*"; tail -5 "${LOAD_SCRATCH:-/tmp}/last-error.log"; }; }

# The nominal 9:30 step: 1,000 queued orders released, 50 new orders/s, 1,000 screens polling (333/s). Then heavier steps to find where it gives.
run step --orders 50 --label step-50-db1
run step --orders 100 --label step-100-db1
run step --orders 150 --label step-150-db1
run step --orders 50 --db-cpu 0.25 --label step-50-db0.25
for screens in 250 500 1000; do
  run polling --screens "$screens" --variant old --label "polling-old-$screens"
  run polling --screens "$screens" --variant fallback --label "polling-fallback-$screens"
done
for connections in 250 500 1000; do run sse --connections "$connections" --label "sse-$connections"; done
run leaderboard --refresh on --label leaderboard-refresh-on
run leaderboard --refresh off --label leaderboard-refresh-off
run leaderboard --refresh on --db-cpu 0.25 --top 800 --label leaderboard-refresh-on-db0.25
for cpu in 1 0.25; do
  for reads in 450 1800; do
    for pools in separate shared; do
      run isolation --pools "$pools" --reads "$reads" --db-cpu "$cpu" --label "iso-$pools-r$reads-db$cpu"
    done
  done
done
# The smaller read stampede, with fifteen orders a second, where the quarter core is not already saturated by the reads.
for pools in separate shared; do run isolation --pools "$pools" --reads 120 --orders 15 --db-cpu 0.25 --label "iso-$pools-r120-o15-db0.25"; done
# The price-gap case: a new close lands 20% above the old one on half the symbols while 1,000 orders are queued.
run step --orders 50 --gap --label step-50-gap-db1
run stress --label stress-db1
run stress --db-cpu 0.25 --label stress-db0.25
# The Part 4 multixact error, attempted under load, on this Postgres.
echo "=== multixact ($(date +%T))"
pnpm exec tsx src/load/multixact.ts "${MULTIXACT_SECONDS:-180}" > /dev/null 2>"${LOAD_SCRATCH:-/tmp}/last-error.log" || { echo "FAILED: multixact"; tail -5 "${LOAD_SCRATCH:-/tmp}/last-error.log"; }
# The 300 s cut, on a real connection, against a stand-in server on a fresh stack (about five minutes).
if [[ -z "${SKIP_SSE_CUT:-}" ]]; then
  echo "=== sse-300s-cut ($(date +%T))"
  scratch="${LOAD_SCRATCH:-/tmp}"
  pkill -f '[s]cripts/load-server.ts' || true
  pnpm exec tsx src/load/stack.ts "$scratch/stack-sse-cut.json" 50 8 > /dev/null 2>&1
  url="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).urls.tradingOwner)' "$scratch/stack-sse-cut.json")"
  (cd ../../apps/web && DATABASE_URL_TRADING="$url" LOAD_DB_URL="$url" POOLS=separate setsid pnpm exec tsx scripts/load-server.ts 3100 > "$scratch/sse-cut-server.log" 2>&1 &)
  sleep 15
  pnpm exec tsx src/load/sse-cut.ts http://127.0.0.1:3100 3 > /dev/null 2>"$scratch/last-error.log" || { echo "FAILED: sse-cut"; tail -5 "$scratch/last-error.log"; }
  pkill -f '[s]cripts/load-server.ts' || true
fi
echo "=== done ($(date +%T))"
