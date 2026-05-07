from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models.admin import CrawlerJob


SPIDER_BY_JOB: dict[str, str] = {
    "ai_news": "hackernews_ai",
}


async def execute_crawler_job(
    session: AsyncSession,
    job: CrawlerJob,
    admin_id: str,
    admin_name: str,
    reason: str,
):
    if not job.enabled:
        raise HTTPException(400, "Crawler job is disabled")

    job_key = job.job_key
    spider_name = SPIDER_BY_JOB.get(job_key)
    if not spider_name:
        raise HTTPException(400, f"Unsupported crawler job: {job_key}")

    job.last_run_at = datetime.now(timezone.utc).replace(tzinfo=None)
    job.last_status = "running"
    session.add(job)
    await session.commit()
    await session.refresh(job)

    try:
        import httpx
        crawler_url = settings.crawler_service_url
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                f"{crawler_url}/run/{spider_name}",
                json={"max_articles": job.posts_per_run},
            )
            resp.raise_for_status()

        job.last_status = "success"
        session.add(job)
        await session.commit()

        return {
            "job_id": job.id,
            "job_key": job_key,
            "spider": spider_name,
            "detail": "Triggered crawler service to run spider",
        }
    except Exception as e:
        job.last_status = "failed"
        session.add(job)
        await session.commit()
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(500, f"Crawl job failed: {str(e)}")
