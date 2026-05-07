import asyncio
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from app.config import settings
from app.spiders import SPIDERS
from app.compliance import process_article

logger = logging.getLogger("crawler.scheduler")


def setup_scheduler(scheduler: BackgroundScheduler):
    for spider in SPIDERS:
        cron_kwargs = parse_simple_schedule(spider.schedule)
        scheduler.add_job(
            lambda s=spider: run_spider(s),
            "cron",
            id=spider.name,
            name=f"Spider: {spider.name}",
            replace_existing=True,
            **cron_kwargs,
        )
        logger.info("Registered spider: %s (%s) -> section: %s", spider.name, spider.schedule, "varies")


def parse_simple_schedule(cron_or_interval: str) -> dict:
    parts = cron_or_interval.split()
    if len(parts) == 5:
        kwargs = {}
        if parts[0] != "*":
            kwargs["minute"] = parts[0]
        if parts[1] != "*":
            kwargs["hour"] = parts[1]
        if parts[2] != "*":
            kwargs["day"] = parts[2]
        if parts[3] != "*":
            kwargs["month"] = parts[3]
        if parts[4] != "*":
            kwargs["day_of_week"] = parts[4]
        return kwargs
    return {"minute": "0", "hour": "*/6"}


def run_spider(spider, max_articles: int | None = None):
    """Synchronous entry point called by APScheduler. Uses single event loop."""
    limit = max_articles if max_articles is not None else settings.spider_max_articles_per_run
    logger.info("Running spider: %s (max_articles=%d)", spider.name, limit)
    try:
        async def _run():
            articles = await spider.fetch()
            fetched = len(articles)
            articles = articles[:limit]
            logger.info("Spider %s: fetched %d articles, ingesting %d", spider.name, fetched, len(articles))
            for article in articles:
                try:
                    article = process_article(article)
                    await _ingest(spider, article)
                except Exception as e:
                    logger.error("Failed to ingest article '%s': %s", article.title, e)

        asyncio.run(_run())
    except Exception as e:
        logger.error("Spider %s failed: %s", spider.name, e)


async def _ingest(spider, article):
    from app.grpc_client import create_post

    result = await create_post(
        title=article.title,
        content=article.content,
        source_url=article.source_url,
        source_name=spider.source_name,
        section_id=article.section_id,
        tags=article.tags,
        auto_publish=settings.crawler_auto_publish,
        author_id=getattr(spider, "author_id", "crawler"),
    )
    logger.info("Ingested: %s -> %s", article.title, result.get("id", "?"))


def run_spider_by_name(name: str, max_articles: int | None = None):
    """Run a spider by name immediately (called from trigger endpoint)."""
    for spider in SPIDERS:
        if spider.name == name:
            logger.info("On-demand trigger: running spider %s (max_articles=%s)", name, max_articles)
            run_spider(spider, max_articles=max_articles)
            return True
    logger.warning("Spider not found: %s", name)
    return False
