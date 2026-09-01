import pytest
from unittest.mock import AsyncMock, patch
from httpx import Response
from app.models.user import User, UserRole
from app.core.security import get_password_hash

from app.core.config import settings

pytestmark = pytest.mark.asyncio

MOCK_GOOGLE_CLIENT_ID = "mock-optitrack-client-id.apps.googleusercontent.com"


class TestGoogleAuth:
    """Test suite for Google OAuth authentication endpoint."""

    @pytest.fixture(autouse=True)
    def setup_google_client_id(self):
        original_id = settings.GOOGLE_CLIENT_ID
        settings.GOOGLE_CLIENT_ID = MOCK_GOOGLE_CLIENT_ID
        yield
        settings.GOOGLE_CLIENT_ID = original_id

    async def test_google_auth_success_new_user(self, client, db_session):
        """Test Google authentication auto-registers a new active user."""
        mock_payload = {
            "aud": MOCK_GOOGLE_CLIENT_ID,
            "email": "newgoogleuser@example.com",
            "email_verified": "true",
            "given_name": "Google",
            "family_name": "Explorer",
            "picture": "https://lh3.googleusercontent.com/a/photo.jpg",
            "sub": "1234567890"
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_get.return_value = Response(200, json=mock_payload)

            response = await client.post(
                "/api/auth/google",
                json={"credential": "valid-simulated-google-jwt-token"}
            )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "newgoogleuser@example.com"
        assert data["user"]["first_name"] == "Google"
        assert data["user"]["last_name"] == "Explorer"
        assert data["user"]["image_url"] == "https://lh3.googleusercontent.com/a/photo.jpg"

    async def test_google_auth_success_existing_user(self, client, db_session):
        """Test Google authentication logs in an existing user."""
        existing_user = User(
            email="existing@example.com",
            password_hash=get_password_hash("Password123!"),
            first_name="Existing",
            last_name="User",
            role=UserRole.ADMIN,
            is_active=True
        )
        db_session.add(existing_user)
        await db_session.commit()

        mock_payload = {
            "aud": MOCK_GOOGLE_CLIENT_ID,
            "email": "existing@example.com",
            "email_verified": True,
            "given_name": "Existing",
            "family_name": "User",
            "picture": "https://lh3.googleusercontent.com/a/photo2.jpg",
            "sub": "9876543210"
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_get.return_value = Response(200, json=mock_payload)

            response = await client.post(
                "/api/auth/google",
                json={"credential": "valid-simulated-google-jwt-token"}
            )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "existing@example.com"

    async def test_google_auth_rejected_invalid_token(self, client):
        """Test Google endpoint rejects invalid/expired tokens."""
        with patch("httpx.AsyncClient.get") as mock_get:
            mock_get.return_value = Response(400, text="Invalid Value")

            response = await client.post(
                "/api/auth/google",
                json={"credential": "expired-or-tampered-token"}
            )

        assert response.status_code == 401
        assert "Invalid or expired Google token" in response.json()["detail"]

    async def test_google_auth_audience_mismatch(self, client):
        """Test Google endpoint rejects tokens minted for different apps."""
        mock_payload = {
            "aud": "wrong-client-id-for-another-app.apps.googleusercontent.com",
            "email": "hacker@example.com",
            "email_verified": True,
            "sub": "99999"
        }

        with patch("httpx.AsyncClient.get") as mock_get:
            mock_get.return_value = Response(200, json=mock_payload)

            response = await client.post(
                "/api/auth/google",
                json={"credential": "token-for-wrong-app"}
            )

        assert response.status_code == 401
        assert "audience mismatch" in response.json()["detail"].lower()