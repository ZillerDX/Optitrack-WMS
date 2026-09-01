"""Authentication routes for user identity and account management."""

import logging
import secrets
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.core.emails import send_reset_password_email
from app.core.limiter import limiter
from app.core.schemas import (
    GoogleAuthRequest,
    LoginRequest,
    PasswordChangeRequest,
    PasswordResetRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
    UserUpdate,
)
from app.core.security import create_access_token, get_password_hash, verify_password
from app.models.user import User, UserRole
from app.services.demo_service import reset_demo_data
from app.services.storage_service import StorageError, storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

ACCESS_TOKEN_COOKIE_NAME = "access_token"
ACCESS_TOKEN_COOKIE_PATH = "/"


def _clear_auth_cookie(response: Response) -> None:
    response.delete_cookie(
        key=ACCESS_TOKEN_COOKIE_NAME,
        path=ACCESS_TOKEN_COOKIE_PATH,
    )


@router.post("/register", response_model=UserResponse)
@limiter.limit("5/minute")
async def register(
    request: Request,
    user_data: UserCreate,
    db: AsyncSession = Depends(get_db),
):
    """Register a new user."""
    result = await db.execute(select(User).where(User.email == user_data.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    new_user = User(
        email=user_data.email,
        password_hash=get_password_hash(user_data.password),
        first_name=user_data.first_name,
        last_name=user_data.last_name,
        role=UserRole(user_data.role),
        image_url=user_data.image_url,
        is_active=True
    )

    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)

    return UserResponse.model_validate(new_user)


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the current authenticated user."""
    return UserResponse.model_validate(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    user_data: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update the current authenticated user's editable profile fields."""
    update_data = user_data.model_dump(exclude_unset=True)
    
    if "role" in update_data:
        del update_data["role"]
    
    for field, value in update_data.items():
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    return UserResponse.model_validate(current_user)


@router.post("/upload-image", response_model=UserResponse)
async def upload_profile_image(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Upload and persist a profile image for the current user."""
    try:
        image_url = await storage_service.upload_image(file, prefix="profiles")
    except HTTPException:
        raise
    except StorageError as exc:
        logger.exception("Object storage upload failed for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Image storage is temporarily unavailable. Please try again.",
        ) from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Unexpected error uploading profile image for user %s", current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process uploaded image.",
        ) from exc

    current_user.image_url = image_url
    await db.commit()
    await db.refresh(current_user)

    return UserResponse.model_validate(current_user)


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    request: Request,
    login_data: LoginRequest,
    db: AsyncSession = Depends(get_db)
):
    """Authenticate a user and issue a JWT."""
    result = await db.execute(select(User).where(User.email == login_data.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(login_data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )

    if user.email == "admin@optitrack.com":
        await reset_demo_data(db, user.id)

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )


@router.post("/google", response_model=TokenResponse)
@limiter.limit("10/minute")
async def google_auth(
    request: Request,
    auth_data: GoogleAuthRequest,
    db: AsyncSession = Depends(get_db),
):
    """Authenticate or register a user using Google OAuth ID token."""
    token = auth_data.credential.strip()
    if not token:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google credential token is required",
        )

    # Verify ID token with Google's tokeninfo API
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"https://oauth2.googleapis.com/tokeninfo?id_token={token}"
            )
    except Exception as exc:
        logger.exception("Failed to connect to Google verification endpoint")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to verify Google token with Google servers",
        ) from exc

    if resp.status_code != 200:
        logger.warning("Google token validation rejected: %s", resp.text)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Google token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = resp.json()

    # Validate Audience if GOOGLE_CLIENT_ID is configured
    expected_client_id = settings.GOOGLE_CLIENT_ID
    if expected_client_id and payload.get("aud") != expected_client_id:
        logger.warning(
            "Google token audience mismatch. Expected: %s, Received: %s",
            expected_client_id,
            payload.get("aud"),
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google token audience mismatch",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Verify email
    email = payload.get("email")
    email_verified = payload.get("email_verified") in (True, "true", "True")
    if not email or not email_verified:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google account must have a verified email address",
        )

    first_name = payload.get("given_name") or payload.get("name", "Google").split()[0]
    last_name = payload.get("family_name") or (
        payload.get("name", "User").split()[-1] if len(payload.get("name", "").split()) > 1 else "User"
    )
    picture = payload.get("picture")

    # Find existing user or auto-create new account
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User account is inactive",
            )
        # Update picture if user doesn't have one
        if picture and not user.image_url:
            user.image_url = picture
            await db.commit()
            await db.refresh(user)
    else:
        # Create new user
        random_password = secrets.token_urlsafe(32)
        user = User(
            email=email,
            password_hash=get_password_hash(random_password),
            first_name=first_name,
            last_name=last_name,
            role=UserRole.ADMIN,
            image_url=picture,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    access_token = create_access_token(
        data={"sub": str(user.id), "email": user.email, "role": user.role}
    )

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        user=UserResponse.model_validate(user),
    )


@router.post("/forgot-password")
async def forgot_password(
    request: PasswordResetRequest,
    db: AsyncSession = Depends(get_db)
):
    """Generate and email a password reset token when the account exists."""
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    
    if not user:
        return {"message": "If the email is registered, a reset link has been sent."}
    
    reset_token_expires = timedelta(hours=1)
    reset_token = create_access_token(
        data={"sub": str(user.id), "scope": "password_reset"},
        expires_delta=reset_token_expires
    )
    
    success = send_reset_password_email(user.email, reset_token)
    
    if not success:
        logger.warning("Password reset email could not be sent to %s", user.email)

    return {"message": "If the email is registered, a reset link has been sent."}


@router.post("/change-password")
async def change_password(
    request: PasswordChangeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Change the current authenticated user's password."""
    if not verify_password(request.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Incorrect current password"
        )

    current_user.password_hash = get_password_hash(request.new_password)
    await db.commit()

    return {"message": "Password updated successfully"}


@router.post("/logout")
async def logout(
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Log out the current user and clear the auth cookie."""
    if current_user.email == "admin@optitrack.com":
        await reset_demo_data(db, current_user.id)

    _clear_auth_cookie(response)
    return {"message": "Logged out successfully"}