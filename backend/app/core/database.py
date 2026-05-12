"""Async database engine and session management."""

import importlib
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base

from app.core.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.SQL_ECHO,
    future=True,
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield a request-scoped database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Create all registered database tables."""
    importlib.import_module("app.models")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with engine.begin() as conn:
        from sqlalchemy import text, inspect as sa_inspect

        def _check_column(sync_conn):
            insp = sa_inspect(sync_conn)
            cols = [c["name"] for c in insp.get_columns("locations")]
            return "capacity" in cols

        has_capacity = await conn.run_sync(_check_column)
        if not has_capacity:
            await conn.execute(
                text("ALTER TABLE locations ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0")
            )


async def close_db() -> None:
    """Dispose database connections."""
    await engine.dispose()
