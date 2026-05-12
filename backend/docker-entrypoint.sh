#!/usr/bin/env bash
# OptiTrack WMS container entrypoint.
#
# This script does NOT run schema migrations. DDL is intentionally a separate,
# one-shot job (`python -m scripts.init_db`) so concurrent worker pods cannot
# race on CREATE TABLE / ALTER TABLE during a rolling deploy.
#
# Optional behavior:
#   - Set RUN_DB_INIT=1 to run scripts/init_db.py before starting the server.
#     Use this only on a single boot (e.g. local Docker Compose), never on
#     multi-replica orchestrators.
#
# Forwards SIGTERM to Gunicorn so the orchestrator can drain workers cleanly.

set -euo pipefail

if [[ "${RUN_DB_INIT:-0}" == "1" ]]; then
  echo "[entrypoint] RUN_DB_INIT=1 — running scripts/init_db.py"
  python -m scripts.init_db
fi

echo "[entrypoint] Starting application: $*"
exec "$@"
