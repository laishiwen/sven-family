"""JWT token utilities and FastAPI auth dependencies."""

from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Header, HTTPException

from config import settings


def create_access_token(user: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours)
    payload = {
        "sub": user["id"],
        "email": user.get("email", ""),
        "username": user.get("username", ""),
        "avatar_url": user.get("avatar_url", ""),
        "role": user.get("role", "user"),
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def verify_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


async def get_current_user(authorization: str = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    payload = verify_access_token(authorization[7:])
    if not payload:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    if not payload.get("sub"):
        raise HTTPException(status_code=401, detail="Invalid token payload")
    return payload


async def get_optional_user(authorization: str = Header(None)) -> dict | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    payload = verify_access_token(authorization[7:])
    return payload if (payload and payload.get("sub")) else None
