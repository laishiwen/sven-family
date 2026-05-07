import hashlib
import logging

from app.config import settings

try:
    import redis as redis_lib

    _redis = redis_lib.from_url(settings.redis_url, decode_responses=True)
except Exception:
    _redis = None

logger = logging.getLogger("crawler.dedup")

TTL_SECONDS = settings.dedup_ttl_days * 24 * 3600


def _key(url: str) -> str:
    return f"crawler:seen:{hashlib.sha256(url.encode()).hexdigest()}"


def is_duplicate(url: str) -> bool:
    """Check if URL has been seen before. Returns True if duplicate.
    If not seen, marks it as seen and returns False.
    Falls back to always-not-duplicate when Redis is unavailable.
    """
    if _redis is None:
        return False

    try:
        key = _key(url)
        already_seen = _redis.exists(key)
        if not already_seen:
            _redis.set(key, "1")
            _redis.expire(key, TTL_SECONDS)
        return bool(already_seen)
    except Exception as e:
        logger.debug("Redis error, dedup skipped: %s", e)
        return False
