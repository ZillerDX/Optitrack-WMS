"""arq worker for AI chat jobs."""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.services.ai_agent_service import ai_agent_service
from app.services.queue import redis_settings_from_url

logger = logging.getLogger(__name__)


async def run_ai_chat(
    ctx: Dict[str, Any],
    user_id: int,
    message: str,
    history: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Run one AI chat turn for a user-owned background job."""
    job_id = ctx.get("job_id", "unknown")
    logger.info("AI job %s start: user_id=%s msg_len=%s", job_id, user_id, len(message))

    async with AsyncSessionLocal() as db:
        try:
            response_text = await ai_agent_service.chat(
                db=db,
                user_id=user_id,
                message=message,
                history=history or [],
            )
        except Exception:  # noqa: BLE001
            logger.exception("AI job %s failed", job_id)
            raise

    logger.info("AI job %s done: response_len=%s", job_id, len(response_text))
    return {
        "response": response_text,
        "user_id": user_id,
    }


async def on_startup(ctx: Dict[str, Any]) -> None:
    logger.info("arq worker starting (queue=%s)", settings.AI_QUEUE_NAME)


async def on_shutdown(ctx: Dict[str, Any]) -> None:
    logger.info("arq worker shutting down")


class WorkerSettings:
    """arq worker configuration."""

    functions = [run_ai_chat]
    queue_name = settings.AI_QUEUE_NAME
    redis_settings = redis_settings_from_url(settings.REDIS_URL)

    on_startup = on_startup
    on_shutdown = on_shutdown

    job_timeout = settings.AI_TASK_TIMEOUT_SECONDS
    max_jobs = 10
    max_tries = settings.AI_TASK_MAX_TRIES
    keep_result = 3600
