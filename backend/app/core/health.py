"""
Readiness probe helpers for /readyz.

Each probe:
- Has a hard async timeout so a stuck dependency cannot block Kubernetes / LB
  health checks.
- Catches all exceptions and converts them into a structured status dict.
- Never raises — the caller decides the HTTP status from the aggregate result.

Notes:
- DB probe is authoritative: if the DB is down, the API cannot serve any
  meaningful request, so /readyz must fail.
- Groq probe is best-effort. Most endpoints don't need Groq. We still report
  it because the user requested it; if you don't want Groq outages to remove
  this pod from the LB, treat its status as informational in the caller.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

# Per-probe timeouts (seconds). Keep these tight — a readiness probe must
# return quickly so orchestrators can react.
DB_PROBE_TIMEOUT_S = 2.0
GROQ_PROBE_TIMEOUT_S = 3.0


async def check_database(db: AsyncSession) -> Dict[str, Any]:
    """Run `SELECT 1` against Postgres with a hard timeout."""
    started = time.perf_counter()
    try:
        async def _query() -> int:
            result = await db.execute(text("SELECT 1"))
            return result.scalar_one()

        value = await asyncio.wait_for(_query(), timeout=DB_PROBE_TIMEOUT_S)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {
            "status": "up" if value == 1 else "down",
            "latency_ms": latency_ms,
        }
    except asyncio.TimeoutError:
        return {
            "status": "down",
            "error": f"timeout after {DB_PROBE_TIMEOUT_S}s",
        }
    except Exception as exc:  # noqa: BLE001 — readiness must never raise
        logger.warning("Database readiness probe failed: %s", exc)
        return {
            "status": "down",
            "error": exc.__class__.__name__,
        }


async def check_groq() -> Dict[str, Any]:
    """
    Lightweight Groq SDK ping via `models.list()`.

    Returns:
        - {"status": "skipped"} if no GROQ_API_KEY is configured.
        - {"status": "up", "latency_ms": ...} on success.
        - {"status": "down", "error": ...} otherwise.
    """
    if not settings.GROQ_API_KEY:
        return {"status": "skipped", "reason": "GROQ_API_KEY not configured"}

    started = time.perf_counter()
    try:
        # Import lazily so a missing/broken Groq SDK never blocks /readyz import.
        from groq import AsyncGroq

        client = AsyncGroq(
            api_key=settings.GROQ_API_KEY,
            timeout=GROQ_PROBE_TIMEOUT_S,
        )

        async def _ping() -> None:
            # `models.list()` is the cheapest authenticated call on the API.
            await client.models.list()

        await asyncio.wait_for(_ping(), timeout=GROQ_PROBE_TIMEOUT_S)
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        return {"status": "up", "latency_ms": latency_ms}
    except asyncio.TimeoutError:
        return {
            "status": "down",
            "error": f"timeout after {GROQ_PROBE_TIMEOUT_S}s",
        }
    except Exception as exc:  # noqa: BLE001
        logger.warning("Groq readiness probe failed: %s", exc)
        return {
            "status": "down",
            "error": exc.__class__.__name__,
        }
