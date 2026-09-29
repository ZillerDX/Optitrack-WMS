"""
ยูทิลิตี้ความปลอดภัยสำหรับการยืนยันตัวตนและการอนุญาต
จัดการการแฮชรหัสผ่านและการสร้าง/ตรวจสอบ JWT token
"""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional
import jwt
from jwt import PyJWTError
import bcrypt
from app.core.config import settings

# การตั้งค่าความปลอดภัย
SECRET_KEY = settings.SECRET_KEY
ALGORITHM = settings.ALGORITHM
ACCESS_TOKEN_EXPIRE_MINUTES = settings.ACCESS_TOKEN_EXPIRE_MINUTES


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    ตรวจสอบรหัสผ่านธรรมดากับรหัสผ่านที่แฮชแล้ว

    Args:
        plain_password: รหัสผ่านข้อความธรรมดา
        hashed_password: รหัสผ่านที่แฮชแล้วสำหรับเปรียบเทียบ

    Returns:
        True ถ้ารหัสผ่านตรงกัน, False ถ้าไม่ตรง
    """
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8') if isinstance(hashed_password, str) else hashed_password
    )


def get_password_hash(password: str) -> str:
    """
    แฮชรหัสผ่านสำหรับจัดเก็บ

    Args:
        password: รหัสผ่านข้อความธรรมดาที่จะแฮช

    Returns:
        รหัสผ่านที่แฮชแล้ว
    """
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    return hashed.decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    สร้าง JWT access token

    Args:
        data: ข้อมูลที่จะเข้ารหัสใน token (โดยปกติคือ user ID และ email)
        expires_delta: เวลาหมดอายุที่กำหนดเอง (ไม่บังคับ)

    Returns:
        JWT token ที่เข้ารหัสแล้ว
    """
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt


def decode_access_token(token: str) -> Optional[dict]:
    """
    ถอดรหัสและตรวจสอบ JWT access token

    Args:
        token: JWT token ที่จะถอดรหัส

    Returns:
        ข้อมูลที่ถอดรหัสแล้วถ้าถูกต้อง, None ถ้าไม่ถูกต้อง
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except PyJWTError:
        return None


PASSWORD_RESET_SCOPE = "password_reset"
PASSWORD_RESET_EXPIRE_MINUTES = 60


def password_fingerprint(password_hash: str) -> str:
    """Short digest of the current password hash.

    Embedded in reset tokens so a token stops working the moment the password
    changes (single use), without storing anything server-side.
    """
    return hashlib.sha256(password_hash.encode("utf-8")).hexdigest()[:16]


def create_password_reset_token(user_id: int, password_hash: str) -> str:
    """Create a short-lived, single-use password reset token."""
    return create_access_token(
        data={
            "sub": str(user_id),
            "scope": PASSWORD_RESET_SCOPE,
            "pwd": password_fingerprint(password_hash),
        },
        expires_delta=timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES),
    )


def decode_password_reset_token(token: str) -> Optional[dict]:
    """Return the payload of a valid reset token, or None for anything else."""
    payload = decode_access_token(token)
    if not payload or payload.get("scope") != PASSWORD_RESET_SCOPE:
        return None
    if not payload.get("sub") or not payload.get("pwd"):
        return None
    return payload

