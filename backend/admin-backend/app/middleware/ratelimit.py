"""Rate limiting middleware using Redis INCR + EXPIRE."""
import time
from typing import Optional

from fastapi import HTTPException, Request
from app.core.redis import get_redis


async def rate_limit(
    request: Request,
    key: str = "",
    max_requests: int = 60,
    window_seconds: int = 60,
) -> None:
    """Rate limit by IP + endpoint. Raises 429 when exceeded."""
    try:
        r = await get_redis()
        client_ip = request.client.host if request.client else "unknown"
        rate_key = f"ratelimit:{key or ''}:{client_ip}"
        current = await r.incr(rate_key)
        if current == 1:
            await r.expire(rate_key, window_seconds)
        if current > max_requests:
            raise HTTPException(
                status_code=429,
                detail={"code": "RATE_LIMITED", "message": "Too many requests"},
                headers={"Retry-After": str(window_seconds)},
            )
    except HTTPException:
        raise
    except Exception:
        pass  # Fail open if Redis is unavailable


def auth_rate_limit(request: Request):
    """5 requests per minute per IP for auth endpoints."""
    return rate_limit(request, key="auth", max_requests=5, window_seconds=60)


def general_rate_limit(request: Request):
    """60 requests per minute per IP for general endpoints."""
    return rate_limit(request, key="general", max_requests=60, window_seconds=60)
