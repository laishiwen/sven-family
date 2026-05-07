import httpx
import logging
from app.config import settings

logger = logging.getLogger("crawler.grpc_client")


async def create_post(
    title: str,
    content: str,
    source_url: str,
    source_name: str,
    section_id: str = "sec-engineering",
    tags: list[str] | None = None,
    auto_publish: bool = False,
    author_id: str = "crawler",
) -> dict:
    """Ingest a crawled article into the community via the bridge HTTP API."""
    payload = {
        "title": title,
        "content": content,
        "source_url": source_url,
        "source_name": source_name,
        "section_id": section_id,
        "tags": tags or [],
        "auto_publish": auto_publish,
        "author_id": author_id,
        "audit": {
            "admin_id": "crawler",
            "admin_name": "Crawler System",
            "reason": "Auto-ingested",
        },
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{settings.community_bridge_url}/admin/crawler/posts", json=payload
        )
        resp.raise_for_status()
        result = resp.json()
        logger.debug("create_post response: %s", result)
        return result
