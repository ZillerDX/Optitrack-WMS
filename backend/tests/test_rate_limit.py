"""Rate limiting: client identification and enforcement."""

import pytest
from httpx import AsyncClient
from starlette.requests import Request

from app.core.config import settings
from app.core.limiter import client_ip, limiter


def _request(forwarded: str | None, remote: str = "10.0.0.9") -> Request:
    headers = []
    if forwarded is not None:
        headers.append((b"x-forwarded-for", forwarded.encode()))
    return Request({"type": "http", "headers": headers, "client": (remote, 1234)})


def test_forwarded_header_ignored_without_trusted_proxy(monkeypatch):
    """A client can send X-Forwarded-For freely, so it must not pick its own bucket."""
    monkeypatch.setattr(settings, "TRUSTED_PROXY_COUNT", 0)
    assert client_ip(_request("1.2.3.4")) == "10.0.0.9"


def test_one_trusted_proxy_uses_entry_it_appended(monkeypatch):
    """Spoofed left-hand entries are ignored; the proxy's own entry is the client."""
    monkeypatch.setattr(settings, "TRUSTED_PROXY_COUNT", 1)
    assert client_ip(_request("6.6.6.6, 203.0.113.7")) == "203.0.113.7"


def test_two_trusted_proxies(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_COUNT", 2)
    assert client_ip(_request("6.6.6.6, 203.0.113.7, 172.16.0.5")) == "203.0.113.7"


def test_missing_or_short_header_falls_back_to_remote(monkeypatch):
    monkeypatch.setattr(settings, "TRUSTED_PROXY_COUNT", 2)
    assert client_ip(_request(None)) == "10.0.0.9"
    assert client_ip(_request("203.0.113.7")) == "10.0.0.9"


@pytest.fixture
def limiter_on():
    limiter.reset()
    limiter.enabled = True
    yield
    limiter.enabled = False
    limiter.reset()


@pytest.mark.asyncio
async def test_forgot_password_is_limited(client: AsyncClient, limiter_on):
    """3/minute: the fourth request from one client is refused."""
    codes = [
        (await client.post("/api/auth/forgot-password", json={"email": "n@test.com"})).status_code
        for _ in range(4)
    ]
    assert codes == [200, 200, 200, 429]


@pytest.mark.asyncio
async def test_change_password_is_limited(client: AsyncClient, admin_token: str, limiter_on):
    headers = {"Authorization": f"Bearer {admin_token}"}
    body = {"current_password": "wrong-password", "new_password": "whatever123"}
    codes = [
        (await client.post("/api/auth/change-password", json=body, headers=headers)).status_code
        for _ in range(6)
    ]
    assert codes[:5] == [400] * 5
    assert codes[5] == 429
