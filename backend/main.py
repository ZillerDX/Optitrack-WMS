"""FastAPI application entrypoint for OptiTrack WMS."""

import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import close_db, get_db, init_db
from app.core.health import check_database, check_groq
from app.core.limiter import limiter
from app.routes import auth, products, transactions, ai_chat, inventory, categories, dashboard, locations

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize optional schema bootstrap and shared external connections."""
    logger.info("Starting %s in %s mode", settings.APP_NAME, settings.ENVIRONMENT)

    if settings.INIT_DB_ON_STARTUP:
        logger.warning(
            "INIT_DB_ON_STARTUP is enabled — running Base.metadata.create_all. "
            "This is intended for development only."
        )
        await init_db()
        logger.info("Database initialized via lifespan")
    else:
        logger.info(
            "Skipping in-process DB init. Run `python -m scripts.init_db` "
            "as a one-shot job before starting the API."
        )

    yield

    logger.info("Shutting down %s", settings.APP_NAME)
    await close_db()
    logger.info("Database connections closed")


app = FastAPI(
    title=settings.APP_NAME,
    description="Production-ready Warehouse Management System with AI Decision Support",
    version=settings.APP_VERSION,
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(auth.router)
app.include_router(products.router)
app.include_router(inventory.router)
app.include_router(transactions.router)
app.include_router(ai_chat.router)
app.include_router(categories.router)
app.include_router(dashboard.router)
app.include_router(locations.router)

if settings.STORAGE_BACKEND == "local":
    app.mount(
        "/uploads",
        StaticFiles(directory=settings.LOCAL_UPLOAD_DIR, check_dir=False),
        name="uploads",
    )


@app.get("/")
async def root():
    """Return basic API metadata."""
    return {
        "message": "OptiTrack WMS API",
        "version": settings.APP_VERSION,
        "status": "online",
        "docs": "/docs",
    }


@app.get("/livez", tags=["Health"])
async def livez():
    """Return process liveness without external dependency checks."""
    return {"status": "alive"}


@app.get("/readyz", tags=["Health"])
async def readyz(db: AsyncSession = Depends(get_db)):
    """Return dependency readiness for traffic routing."""
    db_status = await check_database(db)
    groq_status = await check_groq()

    db_ok = db_status.get("status") == "up"
    groq_ok = groq_status.get("status") in ("up", "skipped")
    is_ready = db_ok and groq_ok

    payload = {
        "status": "ready" if is_ready else "not_ready",
        "checks": {
            "database": db_status,
            "groq": groq_status,
        },
    }

    if is_ready:
        return payload

    return JSONResponse(status_code=503, content=payload)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.ENVIRONMENT == "development",
        log_level="info",
    )
