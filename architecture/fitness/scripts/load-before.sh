#!/usr/bin/env bash
# The three headline cases as the system stood before the account-view indexes (migration 0009), for the before/after comparison in post-facts/part-05.md.
set -uo pipefail
cd "$(dirname "$0")/.."
run() { echo "=== $* ($(date +%T))"; pnpm exec tsx src/load/run.ts "$@" > /dev/null 2>"${LOAD_SCRATCH:-/tmp}/last-error.log" || { echo "FAILED: $*"; tail -5 "${LOAD_SCRATCH:-/tmp}/last-error.log"; }; }
run step --orders 50 --label before-step-50
run polling --screens 1000 --variant fallback --label before-polling-fallback-1000
run isolation --pools separate --reads 450 --label before-iso-separate-r450
echo "=== done ($(date +%T))"
