"""Redis client for caching and rate limiting."""
import json
from typing import Optional
import redis.asyncio as redis
from app.core.config import settings

_pool: Optional[redis.ConnectionPool] = None


async def get_redis() -> redis.Redis:
    global _pool
    if _pool is None:
        _pool = redis.ConnectionPool.from_url(settings.redis_url, max_connections=10)
    return redis.Redis(connection_pool=_pool)


async def cache_get(key: str) -> Optional[dict]:
    try:
        r = await get_redis()
        data = await r.get(key)
        return json.loads(data) if data else None
    except Exception:
        return None


async def cache_set(key: str, value: dict, ttl: int = 300):
    try:
        r = await get_redis()
        await r.setex(key, ttl, json.dumps(value, default=str))
    except Exception:
        pass


async def cache_delete(key: str):
    try:
        r = await get_redis()
        await r.delete(key)
    except Exception:
        pass
