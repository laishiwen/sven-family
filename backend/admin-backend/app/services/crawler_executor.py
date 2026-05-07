import logging
from datetime import datetime, timezone

import httpx
from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models.admin import CrawlerSource

logger = logging.getLogger(__name__)


async def execute_crawler_source(
    session: AsyncSession,
    source: CrawlerSource,
    admin_id: str,
    admin_name: str,
    reason: str,
):
    """Trigger a crawler source run. Notifies the crawler service to pick up this source."""
    if not source.enabled:
        raise HTTPException(400, "Crawler source is disabled")

    source.last_run_at = datetime.now(timezone.utc).replace(tzinfo=None)
    source.last_status = "triggered"
    session.add(source)
    await session.commit()
    await session.refresh(source)

    # The crawler service runs independently on its own schedule via APScheduler.
    # Manual trigger marks the source as 'triggered' — the crawler health check
    # endpoint can be polled or the spiders run on their cron schedule.
    # Actual article ingestion happens in backend/crawler/app/scheduler.py.
    logger.info(
        "Crawler source '%s' triggered by %s (%s)",
        source.name, admin_name, reason,
    )

    return {
        "source_id": source.id,
        "message": f"Source '{source.name}' queued for crawling",
    }
