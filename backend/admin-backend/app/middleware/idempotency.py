"""Idempotency-Key support for admin backend endpoints.

Uses an in-memory dict for development; in production use Redis.
The key is {endpoint}:{idempotency_key} and stores the response for TTL seconds.
"""

import hashlib
import json
import logging
import time
from typing import Optional

from fastapi import HTTPException, Request
from starlette.responses import Response

logger = logging.getLogger("app.middleware.idempotency")

# In-memory store: { cache_key: (expires_at, response_json) }
_cache: dict[str, tuple[float, str]] = {}
_CACHE_TTL = 3600  # 1 hour


def _make_cache_key(request: Request, key: str) -> str:
    raw = f"{request.method}:{request.url.path}:{key}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def check_idempotency(request: Request) -> Optional[Response]:
    """Check for Idempotency-Key header and return cached response if exists.

    Usage in endpoint:
        cached = await check_idempotency(request)
        if cached: return cached
        ... process request ...
        await cache_idempotency(request, response_data)
    """
    idem_key = request.headers.get("Idempotency-Key")
    if not idem_key:
        return None

    cache_key = _make_cache_key(request, idem_key)
    now = time.time()

    if cache_key in _cache:
        expires_at, cached_body = _cache[cache_key]
        if now < expires_at:
            logger.debug("Idempotency hit: %s", cache_key)
            return Response(
                content=cached_body,
                status_code=200,
                media_type="application/json",
                headers={"Idempotency-Key-Replayed": "true"},
            )
        else:
            del _cache[cache_key]

    return None


async def cache_idempotency(request: Request, response_data: dict) -> None:
    """Store the response for an Idempotency-Key."""
    idem_key = request.headers.get("Idempotency-Key")
    if not idem_key:
        return

    cache_key = _make_cache_key(request, idem_key)
    _cache[cache_key] = (time.time() + _CACHE_TTL, json.dumps(response_data, default=str))
    logger.debug("Idempotency stored: %s", cache_key)
