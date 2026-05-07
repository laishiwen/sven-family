import logging
from datetime import timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlmodel import select
from app.core.database import async_session_factory
from app.models.admin import CrawlerSource, CrawlerJob
from app.services.crawler_job_executor import execute_crawler_job
from app.services.crawler_executor import execute_crawler_source

logger = logging.getLogger(__name__)

_scheduler: AsyncIOScheduler | None = None


async def _run_scheduled_crawl(source_id: str):
    async with async_session_factory() as session:
        source = await session.get(CrawlerSource, source_id)
        if not source or not source.enabled:
            return
        await execute_crawler_source(
            session=session,
            source=source,
            admin_id="system",
            admin_name="system",
            reason="Scheduled trigger",
        )


async def _run_scheduled_crawler_job(job_id: str):
    async with async_session_factory() as session:
        job = await session.get(CrawlerJob, job_id)
        if not job or not job.enabled:
            return
        await execute_crawler_job(
            session=session,
            job=job,
            admin_id="system",
            admin_name="system",
            reason="Scheduled trigger",
        )


async def reload_crawler_schedule_jobs():
    global _scheduler
    if _scheduler is None:
        return

    for job in list(_scheduler.get_jobs()):
        if (
            job.id.startswith("crawler:")
            or job.id.startswith("crawler-source:")
            or job.id.startswith("crawler-job:")
        ):
            _scheduler.remove_job(job.id)

    async with async_session_factory() as session:
        result = await session.exec(
            select(CrawlerSource).where(CrawlerSource.enabled == True)
        )
        sources = result.all()

    for source in sources:
        if not source.schedule_cron:
            continue
        try:
            trigger = CronTrigger.from_crontab(source.schedule_cron, timezone=timezone.utc)
            _scheduler.add_job(
                _run_scheduled_crawl,
                trigger=trigger,
                args=[source.id],
                id=f"crawler-source:{source.id}",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
        except Exception as e:
            logger.warning(
                "Skip invalid crawler cron: source_id=%s cron=%s error=%s",
                source.id,
                source.schedule_cron,
                e,
            )

    async with async_session_factory() as session:
        result = await session.exec(select(CrawlerJob).where(CrawlerJob.enabled == True))
        jobs = result.all()

    for crawler_job in jobs:
        if not crawler_job.schedule_cron:
            continue
        try:
            trigger = CronTrigger.from_crontab(crawler_job.schedule_cron, timezone=timezone.utc)
            _scheduler.add_job(
                _run_scheduled_crawler_job,
                trigger=trigger,
                args=[crawler_job.id],
                id=f"crawler-job:{crawler_job.id}",
                replace_existing=True,
                max_instances=1,
                coalesce=True,
            )
        except Exception as e:
            logger.warning(
                "Skip invalid crawler job cron: job_id=%s cron=%s error=%s",
                crawler_job.id,
                crawler_job.schedule_cron,
                e,
            )


async def start_crawler_scheduler():
    global _scheduler
    if _scheduler is not None:
        return

    _scheduler = AsyncIOScheduler(timezone=timezone.utc)
    _scheduler.start()
    await reload_crawler_schedule_jobs()
    logger.info("Crawler scheduler started")


def stop_crawler_scheduler():
    global _scheduler
    if _scheduler is None:
        return
    _scheduler.shutdown(wait=False)
    _scheduler = None
    logger.info("Crawler scheduler stopped")


def get_crawler_scheduler_state() -> dict:
    if _scheduler is None:
        return {
            "running": False,
            "job_count": 0,
        }
    return {
        "running": bool(_scheduler.running),
        "job_count": len(_scheduler.get_jobs()),
    }
