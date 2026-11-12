#!/usr/bin/env bash
# Every local load case of Part 5, one after another, each writing post-facts/part-05-runs/<label>.json.
# Needs: k6 (K6=/path/to/k6), a LOCAL throwaway Postgres cluster (TEST_DATABASE_URL), run from architecture/fitness.
# The database is held to a quarter of a core for the "-db0.25" runs by src/load/throttle.ts (an approximation of Neon's 0.25 CU, see its header).
set -uo pipefail
cd "$(dirname "$0")/.."
run() { echo "=== $* ($(date +%T))"; pnpm exec tsx src/load/run.ts "$@" > /dev/null 2>"${LOAD_SCRATCH:-/tmp}/last-error.log" || { echo "FAILED: $*"; tail -5 "${LOAD_SCRATCH:-/tmp}/last-error.log"; }; }

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
run stress --label stress-db1
run stress --db-cpu 0.25 --label stress-db0.25
echo "=== done ($(date +%T))"
