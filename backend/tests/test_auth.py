"""
Tests for authentication endpoints.
Tests user registration, login, token validation, and role-based access.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole


class TestAuthentication:
    """Test cases for authentication functionality."""

    @pytest.mark.asyncio
    async def test_register_new_user(self, client: AsyncClient):
        """Test successful user registration."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@test.com",
                "password": "password123",
                "first_name": "New",
                "last_name": "User",
                "role": "ADMIN"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "newuser@test.com"
        assert data["first_name"] == "New"
        assert data["role"] == "ADMIN"
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_register_ignores_client_supplied_role(self, client: AsyncClient):
        """The system has a single ADMIN role; a client-supplied role is ignored."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "staffwannabe@test.com",
                "password": "password123",
                "first_name": "Staff",
                "last_name": "Wannabe",
                "role": "STAFF",
            },
        )
        assert response.status_code == 200
        assert response.json()["role"] == "ADMIN"

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, client: AsyncClient, admin_user: User):
        """Test registration with existing email fails."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "admin@test.com",
                "password": "password123",
                "first_name": "Duplicate",
                "last_name": "User",
                "role": "ADMIN"
            }
        )
        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_register_invalid_email(self, client: AsyncClient):
        """Test registration with invalid email format fails."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "invalid-email",
                "password": "password123",
                "first_name": "Test",
                "last_name": "User",
                "role": "ADMIN"
            }
        )
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_login_success(self, client: AsyncClient, admin_user: User):
        """Test successful login returns access token."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "admin@test.com",
                "password": "admin123"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["email"] == "admin@test.com"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, client: AsyncClient, admin_user: User):
        """Test login with incorrect password fails."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "admin@test.com",
                "password": "wrongpassword"
            }
        )
        assert response.status_code == 401
        assert "incorrect" in response.json()["detail"].lower()

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, client: AsyncClient):
        """Test login with non-existent user fails."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": "notfound@test.com",
                "password": "password123"
            }
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_scoped_reset_token_cannot_authenticate(self, client: AsyncClient, admin_user: User):
        """A password-reset token must not work as a session/access token."""
        from app.core.security import create_access_token

        reset_token = create_access_token(
            data={"sub": str(admin_user.id), "scope": "password_reset"}
        )
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {reset_token}"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user(self, client: AsyncClient, admin_token: str):
        """Test retrieving current user with valid token."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@test.com"
        assert data["role"] == "ADMIN"

    @pytest.mark.asyncio
    async def test_get_current_user_invalid_token(self, client: AsyncClient):
        """Test retrieving current user with invalid token fails."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        assert response.status_code == 401

    @pytest.mark.asyncio
    async def test_get_current_user_no_token(self, client: AsyncClient):
        """Test retrieving current user without token fails."""
        response = await client.get("/api/auth/me")
        assert response.status_code == 403  # HTTPBearer ส่งคืน 403 เมื่อไม่มีการระบุการตรวจสอบสิทธิ์


class TestRoleBasedAccess:
    """Test cases for role-based access control."""

    @pytest.mark.asyncio
    async def test_admin_can_create_user(self, client: AsyncClient, admin_token: str):
        """Test admin can create new users."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "created@test.com",
                "password": "password123",
                "first_name": "Created",
                "last_name": "User",
                "role": "ADMIN"
            },
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200

    @pytest.mark.asyncio
    async def test_admin_role_assigned(self, client: AsyncClient, admin_user: User):
        """Test admin user has correct role."""
        assert admin_user.role == UserRole.ADMIN


class TestPasswordSecurity:
    """Test cases for password security."""

    @pytest.mark.asyncio
    async def test_password_is_hashed(self, db_session: AsyncSession, admin_user: User):
        """Test that passwords are hashed in database."""
        assert admin_user.password_hash is not None
        assert admin_user.password_hash != "admin123"
        assert len(admin_user.password_hash) > 20

    @pytest.mark.asyncio
    async def test_password_not_in_response(self, client: AsyncClient, admin_token: str):
        """Test that password hash is not returned in API responses."""
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        data = response.json()
        assert "password" not in data
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_short_password_rejected(self, client: AsyncClient):
        """Test that short passwords are rejected."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "test@test.com",
                "password": "123",
                "first_name": "Test",
                "last_name": "User",
                "role": "ADMIN"
            }
        )
        assert response.status_code == 422

class TestPasswordReset:
    """Forgot-password -> reset-password flow."""

    @staticmethod
    async def _request_token(client: AsyncClient, email: str) -> str:
        from unittest.mock import patch

        with patch("app.routes.auth.send_reset_password_email", return_value=True) as sent:
            resp = await client.post("/api/auth/forgot-password", json={"email": email})
        assert resp.status_code == 200
        return sent.call_args.args[1]

    @pytest.mark.asyncio
    async def test_full_reset_flow_and_single_use(self, client: AsyncClient, admin_user: User):
        token = await self._request_token(client, "admin@test.com")

        resp = await client.post(
            "/api/auth/reset-password", json={"token": token, "new_password": "brandNew123"}
        )
        assert resp.status_code == 200

        old = await client.post(
            "/api/auth/login", json={"email": "admin@test.com", "password": "admin123"}
        )
        assert old.status_code == 401
        new = await client.post(
            "/api/auth/login", json={"email": "admin@test.com", "password": "brandNew123"}
        )
        assert new.status_code == 200

        # The same link cannot be used twice: the password changed under it.
        again = await client.post(
            "/api/auth/reset-password", json={"token": token, "new_password": "another456"}
        )
        assert again.status_code == 400

    @pytest.mark.asyncio
    async def test_unknown_email_gets_generic_response_and_no_email(self, client: AsyncClient):
        from unittest.mock import patch

        with patch("app.routes.auth.send_reset_password_email") as sent:
            resp = await client.post("/api/auth/forgot-password", json={"email": "nobody@test.com"})
        assert resp.status_code == 200
        assert "if the email is registered" in resp.json()["message"].lower()
        sent.assert_not_called()

    @pytest.mark.asyncio
    async def test_access_token_cannot_reset_password(self, client: AsyncClient, admin_token: str):
        resp = await client.post(
            "/api/auth/reset-password", json={"token": admin_token, "new_password": "hacked123"}
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_expired_token_rejected(self, client: AsyncClient, admin_user: User):
        from datetime import timedelta

        from app.core.security import create_access_token, password_fingerprint

        expired = create_access_token(
            data={
                "sub": str(admin_user.id),
                "scope": "password_reset",
                "pwd": password_fingerprint(admin_user.password_hash),
            },
            expires_delta=timedelta(minutes=-1),
        )
        resp = await client.post(
            "/api/auth/reset-password", json={"token": expired, "new_password": "brandNew123"}
        )
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_overlong_password_rejected(self, client: AsyncClient, admin_user: User):
        token = await self._request_token(client, "admin@test.com")
        resp = await client.post(
            "/api/auth/reset-password", json={"token": token, "new_password": "x" * 100}
        )
        assert resp.status_code == 422
