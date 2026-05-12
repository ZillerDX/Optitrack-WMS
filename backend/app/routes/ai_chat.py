"""AI chat routes."""

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.schemas import AIChatMessage
from app.models.user import User
from app.services.ai_agent_service import ai_agent_service

router = APIRouter(prefix="/api/ai", tags=["AI Chat"])
logger = logging.getLogger(__name__)


@router.post("/chat")
async def chat_with_ai(
    chat_message: AIChatMessage,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return an AI chat response for the current user."""
    history = [h.model_dump() for h in (chat_message.history or [])]

    try:
        response_text = await ai_agent_service.chat(
            db=db,
            user_id=current_user.id,
            message=chat_message.message,
            history=history,
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("AI chat failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="AI chat is temporarily unavailable. Please retry.",
        ) from exc

    return {"response": response_text}

