#!/usr/bin/env bash
# Start / stop a real PostgreSQL + PostgREST with the migrations applied, for the integration
# tests (frontend: `npm run test:integration`). Needs Docker. Works the same in CI.
#
#   eval "$(bash supabase/tests/integration-stack.sh up)"     # prints the env vars to export
#   bash supabase/tests/integration-stack.sh down
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
NET=wms-itest
DB=wms-itest-db
REST=wms-itest-rest
JWT_SECRET="integration-jwt-secret-0123456789-0123456789"
PG_PORT="${WMS_ITEST_PG_PORT:-55440}"
REST_PORT="${WMS_ITEST_REST_PORT:-55441}"
PGIMAGE=postgres:16
RESTIMAGE=postgrest/postgrest:v12.2.3

psqlc() { docker exec -i "$DB" psql -U postgres -X -q -v ON_ERROR_STOP=1 "$@"; }

up() {
    down >/dev/null 2>&1 || true
    docker network create "$NET" >/dev/null
    docker run -d --name "$DB" --network "$NET" -e POSTGRES_PASSWORD=postgres -p "$PG_PORT:5432" "$PGIMAGE" \
        -c max_connections=200 >/dev/null
    for _ in $(seq 1 60); do docker exec "$DB" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
    sleep 2 # the entrypoint restarts postgres once after initialisation

    psqlc <"$ROOT/supabase/tests/roles.sql" >/dev/null
    for f in "$ROOT"/supabase/migrations/*.sql; do psqlc <"$f" >/dev/null; done

    docker run -d --name "$REST" --network "$NET" -p "$REST_PORT:3000" \
        -e PGRST_DB_URI="postgres://authenticator:authenticator@$DB:5432/postgres" \
        -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$JWT_SECRET" \
        "$RESTIMAGE" >/dev/null
    for _ in $(seq 1 60); do
        curl -fs "http://127.0.0.1:$REST_PORT/" >/dev/null 2>&1 && break
        sleep 1
    done
    curl -fs "http://127.0.0.1:$REST_PORT/" >/dev/null || { docker logs "$REST" | tail -20 >&2; echo "PostgREST did not start" >&2; exit 1; }

    echo "export INTEGRATION_POSTGREST_URL=http://127.0.0.1:$REST_PORT"
    echo "export INTEGRATION_JWT_SECRET=$JWT_SECRET"
    echo "export PGHOST=127.0.0.1 PGPORT=$PG_PORT PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres"
}

down() {
    docker rm -f "$REST" "$DB" >/dev/null 2>&1 || true
    docker network rm "$NET" >/dev/null 2>&1 || true
}

case "${1:-}" in
    up) up ;;
    down) down ;;
    *) echo "usage: $0 up|down" >&2; exit 2 ;;
esac
