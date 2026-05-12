"""Async image storage service for local or S3-compatible backends."""

from __future__ import annotations

import logging
import os
import uuid
from asyncio import to_thread
from typing import Optional

import aioboto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings

logger = logging.getLogger(__name__)

ALLOWED_IMAGE_CONTENT_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


class StorageError(Exception):
    """Raised when object storage operations fail."""


class StorageService:
    """Async wrapper around local or S3-compatible image storage."""

    def __init__(self) -> None:
        self._session = aioboto3.Session()
        self._boto_config = BotoConfig(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.S3_USE_PATH_STYLE else "auto"},
            retries={"max_attempts": 3, "mode": "standard"},
        )

    def _client_kwargs(self) -> dict:
        """Common kwargs for `session.client('s3', ...)`."""
        kwargs: dict = {
            "region_name": settings.S3_REGION,
            "config": self._boto_config,
        }
        if settings.S3_ENDPOINT_URL:
            kwargs["endpoint_url"] = settings.S3_ENDPOINT_URL
        if settings.S3_ACCESS_KEY_ID and settings.S3_SECRET_ACCESS_KEY:
            kwargs["aws_access_key_id"] = settings.S3_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.S3_SECRET_ACCESS_KEY
        return kwargs

    @staticmethod
    def _generate_key(prefix: str, filename: Optional[str]) -> str:
        """Build a collision-free object key."""
        ext = ""
        if filename:
            ext = os.path.splitext(filename)[1].lower()
        if not ext:
            ext = ".bin"
        return f"{prefix.strip('/')}/{uuid.uuid4().hex}{ext}"

    def _public_url_for(self, key: str) -> str:
        """Resolve a public URL for an object key."""
        if settings.S3_PUBLIC_URL_BASE:
            return f"{settings.S3_PUBLIC_URL_BASE.rstrip('/')}/{key}"
        if settings.S3_ENDPOINT_URL:
            return f"{settings.S3_ENDPOINT_URL.rstrip('/')}/{settings.S3_BUCKET}/{key}"
        return f"https://{settings.S3_BUCKET}.s3.{settings.S3_REGION}.amazonaws.com/{key}"

    async def _upload_local_bytes(self, data: bytes, *, key: str) -> str:
        target_path = os.path.join(settings.LOCAL_UPLOAD_DIR, *key.split("/"))
        os.makedirs(os.path.dirname(target_path), exist_ok=True)

        await to_thread(self._write_bytes, target_path, data)

        return f"/uploads/{key}"

    @staticmethod
    def _write_bytes(target_path: str, data: bytes) -> None:
        with open(target_path, "wb") as out_file:
            out_file.write(data)

    async def upload_bytes(
        self,
        data: bytes,
        *,
        key: str,
        content_type: str,
        cache_control: str = "public, max-age=31536000, immutable",
    ) -> str:
        """Upload raw bytes and return the public URL."""
        if not settings.S3_BUCKET:
            raise StorageError("S3_BUCKET is not configured")

        async with self._session.client("s3", **self._client_kwargs()) as s3:
            try:
                await s3.put_object(
                    Bucket=settings.S3_BUCKET,
                    Key=key,
                    Body=data,
                    ContentType=content_type,
                    CacheControl=cache_control,
                )
            except (BotoCoreError, ClientError) as exc:
                logger.exception("S3 put_object failed for key=%s", key)
                raise StorageError(f"Failed to upload object: {exc}") from exc

        return self._public_url_for(key)

    async def upload_image(
        self,
        upload: UploadFile,
        *,
        prefix: str = "profiles",
    ) -> str:
        """Validate and upload a FastAPI image file."""
        content_type = (upload.content_type or "").lower()
        if content_type not in ALLOWED_IMAGE_CONTENT_TYPES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported image type: {content_type or 'unknown'}",
            )

        data = await upload.read(settings.S3_MAX_UPLOAD_BYTES + 1)
        if len(data) > settings.S3_MAX_UPLOAD_BYTES:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=(
                    f"Image exceeds maximum size of "
                    f"{settings.S3_MAX_UPLOAD_BYTES // 1024} KB"
                ),
            )

        key = self._generate_key(prefix=prefix, filename=upload.filename)

        try:
            if settings.STORAGE_BACKEND == "local":
                return await self._upload_local_bytes(data=data, key=key)

            return await self.upload_bytes(
                data=data,
                key=key,
                content_type=content_type,
            )
        except StorageError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail="Object storage is unavailable. Please retry shortly.",
            ) from exc

    async def delete(self, key: str) -> None:
        """Best-effort deletion. Logs and swallows errors."""
        if not settings.S3_BUCKET:
            return
        async with self._session.client("s3", **self._client_kwargs()) as s3:
            try:
                await s3.delete_object(Bucket=settings.S3_BUCKET, Key=key)
            except (BotoCoreError, ClientError) as exc:
                logger.warning("S3 delete failed for key=%s: %s", key, exc)

storage_service = StorageService()
