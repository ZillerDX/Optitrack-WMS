"""arq Redis queue pool management."""

from __future__ import annotations

import logging
from typing import Optional
from urllib.parse import unquote, urlparse

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_pool: Optional[ArqRedis] = None


def _redis_settings() -> RedisSettings:
    """Translate REDIS_URL into arq's RedisSettings."""
    return redis_settings_from_url(settings.REDIS_URL)


def redis_settings_from_url(redis_url: str) -> RedisSettings:
    """Parse a Redis DSN into arq's RedisSettings."""
    parsed = urlparse(redis_url)
    if parsed.scheme not in {"redis", "rediss"}:
        raise ValueError("REDIS_URL must use redis:// or rediss://")

    database = int(parsed.path.lstrip("/") or "0")
    password = unquote(parsed.password) if parsed.password else None

    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        database=database,
        password=password,
        ssl=parsed.scheme == "rediss",
    )


async def init_queue() -> None:
    """Initialize the global arq Redis pool. Idempotent."""
    global _pool
    if _pool is not None:
        return
    _pool = await create_pool(_redis_settings())
    logger.info("arq Redis pool ready (queue=%s)", settings.AI_QUEUE_NAME)


async def close_queue() -> None:
    """Close the pool on shutdown."""
    global _pool
    if _pool is None:
        return
    await _pool.close()
    _pool = None
    logger.info("arq Redis pool closed")


def get_queue() -> ArqRedis:
    """Return the initialized pool. Raises if the lifespan didn't run."""
    if _pool is None:
        raise RuntimeError(
            "arq Redis pool is not initialized. Did you forget to call init_queue() in lifespan?"
        )
    return _pool
