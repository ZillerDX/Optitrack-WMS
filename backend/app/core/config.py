"""Centralized application settings and production validation."""

import os
from typing import List, Optional

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ENV_PATH = os.path.join(BASE_DIR, ".env")

_INSECURE_SECRET_KEYS = {
    "optitrack-secret-key-change-in-production-2024",
    "change-me",
    "secret",
    "",
}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    APP_NAME: str = "OptiTrack WMS API"
    APP_VERSION: str = "1.0.0"

    ENVIRONMENT: str = Field(default="development", pattern="^(development|staging|production)$")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/optitrack_wms"
    SQL_ECHO: bool = False
    INIT_DB_ON_STARTUP: bool = False

    SECRET_KEY: str = Field(..., min_length=1)
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    ALLOWED_ORIGINS: List[str] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )

    GROQ_API_KEY: Optional[str] = None
    GROQ_MODEL: str = "llama-3.3-70b-versatile"

    STORAGE_BACKEND: str = Field(default="local", pattern="^(local|s3)$")
    LOCAL_UPLOAD_DIR: str = os.path.join(BASE_DIR, "uploads")
    S3_ENDPOINT_URL: Optional[str] = None
    S3_REGION: str = "us-east-1"
    S3_BUCKET: Optional[str] = None
    S3_ACCESS_KEY_ID: Optional[str] = None
    S3_SECRET_ACCESS_KEY: Optional[str] = None
    S3_PUBLIC_URL_BASE: Optional[str] = None
    S3_USE_PATH_STYLE: bool = False
    S3_MAX_UPLOAD_BYTES: int = 5 * 1024 * 1024

    REDIS_URL: str = "redis://localhost:6379/0"
    AI_QUEUE_NAME: str = "ai_jobs"
    AI_TASK_TIMEOUT_SECONDS: int = 60
    AI_TASK_MAX_TRIES: int = 2

    SMTP_HOST: Optional[str] = None
    SMTP_PORT: int = 587
    SMTP_USER: Optional[str] = None
    SMTP_PASSWORD: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"

    model_config = SettingsConfigDict(
        env_file=ENV_PATH,
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_allowed_origins(cls, value):
        """Parse ALLOWED_ORIGINS from JSON-array or comma-separated values."""
        if value is None or value == "":
            return []
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return value
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @model_validator(mode="after")
    def _enforce_production_security(self) -> "Settings":
        """Enforce fail-fast safety rules for production deployments."""
        if self.ENVIRONMENT != "production":
            return self

        if self.SECRET_KEY in _INSECURE_SECRET_KEYS:
            raise ValueError(
                "SECRET_KEY is set to an insecure placeholder value. "
                "Generate a strong random key (>= 32 chars) and set it via the SECRET_KEY env var."
            )
        if len(self.SECRET_KEY) < 32:
            raise ValueError(
                f"SECRET_KEY must be at least 32 characters in production "
                f"(got {len(self.SECRET_KEY)})."
            )

        if not self.ALLOWED_ORIGINS:
            raise ValueError(
                "ALLOWED_ORIGINS must be set explicitly in production "
                "(comma-separated list of allowed frontend origins)."
            )
        unsafe = [
            origin for origin in self.ALLOWED_ORIGINS
            if "localhost" in origin or "127.0.0.1" in origin
        ]
        if unsafe:
            raise ValueError(
                f"ALLOWED_ORIGINS contains development origins in production: {unsafe}. "
                "Remove them before deploying."
            )

        if "postgres:postgres@localhost" in self.DATABASE_URL:
            raise ValueError(
                "DATABASE_URL must not use the default local Postgres credentials in production."
            )

        if self.INIT_DB_ON_STARTUP:
            raise ValueError(
                "INIT_DB_ON_STARTUP must be False in production. "
                "Run scripts/init_db.py as a pre-deploy job instead."
            )

        if self.STORAGE_BACKEND == "s3":
            missing = [
                name for name, value in (
                    ("S3_BUCKET", self.S3_BUCKET),
                    ("S3_ACCESS_KEY_ID", self.S3_ACCESS_KEY_ID),
                    ("S3_SECRET_ACCESS_KEY", self.S3_SECRET_ACCESS_KEY),
                ) if not value
            ]
            if missing:
                raise ValueError(
                    f"STORAGE_BACKEND=s3 but missing required settings: {missing}"
                )

        return self


settings = Settings()
