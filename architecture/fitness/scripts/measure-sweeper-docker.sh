#!/usr/bin/env bash
# Runs the sweeper container (apps/sweeper/Dockerfile) against a throwaway local Postgres and the real sweep route. Local only.
# Usage: pnpm --filter @bullpen/fitness-checks db:measure-sweeper-docker
set -euo pipefail
cd "$(dirname "$0")/.."
name="bullpen-measure-sweeper-docker-$$"
trap 'docker rm -f "$name" >/dev/null 2>&1 || true' EXIT
docker run -d --name "$name" -e POSTGRES_PASSWORD=postgres -p 127.0.0.1::5432 postgres:17-alpine >/dev/null
port="$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')"
for _ in $(seq 1 40); do
  docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break
  sleep 0.5
done
TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${port}/postgres" pnpm exec tsx src/measure/sweeper-docker.ts "$@"
