"""Tests for profile image upload hardening."""

import os

import pytest
from httpx import AsyncClient

from app.core.config import settings

pytestmark = pytest.mark.asyncio

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
HTML = b"<html><script>alert(1)</script></html>"


@pytest.fixture(autouse=True)
def local_storage(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "STORAGE_BACKEND", "local")
    monkeypatch.setattr(settings, "LOCAL_UPLOAD_DIR", str(tmp_path))
    return tmp_path


async def _upload(client, token, name, data, content_type):
    return await client.post(
        "/api/auth/upload-image",
        headers={"Authorization": f"Bearer {token}"},
        files={"file": (name, data, content_type)},
    )


async def test_extension_comes_from_content_not_filename(client: AsyncClient, admin_token, local_storage):
    """A valid PNG named evil.html must be stored as .png."""
    resp = await _upload(client, admin_token, "evil.html", PNG, "image/png")
    assert resp.status_code == 200
    url = resp.json()["image_url"]
    assert url.endswith(".png")
    assert ".html" not in url
    stored = [f for _, _, files in os.walk(local_storage) for f in files]
    assert stored and all(f.endswith(".png") for f in stored)


async def test_html_disguised_as_png_is_rejected(client: AsyncClient, admin_token, local_storage):
    """HTML declared as image/png fails magic-byte validation and is not written."""
    resp = await _upload(client, admin_token, "x.png", HTML, "image/png")
    assert resp.status_code == 400
    assert not [f for _, _, files in os.walk(local_storage) for f in files]


async def test_declared_type_must_match_content(client: AsyncClient, admin_token):
    """A PNG declared as image/jpeg is rejected."""
    resp = await _upload(client, admin_token, "x.jpg", PNG, "image/jpeg")
    assert resp.status_code == 400
