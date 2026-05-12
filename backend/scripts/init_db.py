"""
Standalone DB bootstrap script.

Run this ONCE per deployment, BEFORE starting any application workers.
It is idempotent — re-running on an existing schema is a no-op for tables
that already exist (CREATE TABLE IF NOT EXISTS semantics from
`Base.metadata.create_all`) and the lightweight ALTERs check first.

Why a separate script (not lifespan)?
- Multiple Gunicorn workers booting in parallel would race on CREATE TABLE
  and ALTER TABLE statements, causing deploy-time crash loops.
- Running schema setup once, deterministically, in a pre-deploy job removes
  that race entirely.

Usage:
    # Local dev
    python -m scripts.init_db

    # In a Dockerized deploy (one-shot job)
    docker run --rm --env-file .env optitrack-api python -m scripts.init_db

    # Kubernetes
    Use a Job (not a Deployment) that runs this command and completes
    before the API Deployment rolls out.

Long-term note: replace `Base.metadata.create_all` + ad-hoc ALTERs with
Alembic migrations. This script becomes `alembic upgrade head` then.
"""

from __future__ import annotations

import asyncio
import logging
import sys

# Importing settings will also fail-fast if SECRET_KEY etc. are missing.
from app.core.config import settings
from app.core.database import close_db, init_db
# Import the models package so SQLAlchemy registers every table on Base
# before create_all runs. Without this import, only models referenced
# elsewhere would be created.
from app.models import (  # noqa: F401  (imported for side effects)
    Category,
    Inventory,
    Location,
    Product,
    Transaction,
    User,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s | %(message)s",
)
logger = logging.getLogger("scripts.init_db")


async def main() -> int:
    logger.info(
        "Initializing database for environment=%s url=%s",
        settings.ENVIRONMENT,
        # Mask credentials before logging the connection string
        _mask_db_url(settings.DATABASE_URL),
    )
    try:
        await init_db()
    except Exception as exc:  # noqa: BLE001
        logger.exception("Database initialization FAILED: %s", exc)
        return 1
    finally:
        await close_db()

    logger.info("Database initialization complete.")
    return 0


def _mask_db_url(url: str) -> str:
    """Mask the password portion of a SQLAlchemy URL for safe logging."""
    try:
        scheme, rest = url.split("://", 1)
        if "@" not in rest:
            return url
        creds, host = rest.split("@", 1)
        if ":" in creds:
            user, _ = creds.split(":", 1)
            return f"{scheme}://{user}:***@{host}"
        return url
    except Exception:  # noqa: BLE001
        return "***"


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
