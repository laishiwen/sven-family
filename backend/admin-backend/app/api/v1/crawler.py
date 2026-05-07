from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from apscheduler.triggers.cron import CronTrigger
from pydantic import BaseModel
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models.admin import CrawlerSource, CrawlerJob
from app.middleware.auth import get_current_admin
from app.services.crawler_job_meta import build_job_description, parse_job_description
from app.services.crawler_job_executor import execute_crawler_job
from app.services.crawler_executor import execute_crawler_source
from app.services.crawler_scheduler import (
    get_crawler_scheduler_state,
    reload_crawler_schedule_jobs,
)

router = APIRouter()


class CrawlerSourceCreate(BaseModel):
    name: str
    site_url: Optional[str] = None
    rss_url: Optional[str] = None
    schedule_cron: Optional[str] = None
    enabled: bool = True
    tags: Optional[str] = "[]"
    auto_publish: bool = True


class CrawlerSourceUpdate(BaseModel):
    name: Optional[str] = None
    site_url: Optional[str] = None
    rss_url: Optional[str] = None
    schedule_cron: Optional[str] = None
    enabled: Optional[bool] = None
    tags: Optional[str] = None
    auto_publish: Optional[bool] = None


class CrawlerJobCreate(BaseModel):
    name: str
    description: Optional[str] = None
    schedule_cron: str = "0 */6 * * *"
    enabled: bool = True
    auto_publish: bool = True
    posts_per_run: int = 1
    target_sections: Optional[list[str]] = None


class CrawlerJobUpdate(BaseModel):
    schedule_cron: Optional[str] = None
    enabled: Optional[bool] = None
    auto_publish: Optional[bool] = None
    posts_per_run: Optional[int] = None
    description: Optional[str] = None
    target_sections: Optional[list[str]] = None


@router.get("/overview")
async def get_crawler_overview(
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    result = await session.exec(select(CrawlerSource))
    sources = result.all()
    jobs_result = await session.exec(select(CrawlerJob))
    jobs = jobs_result.all()

    total_sources = len(sources)
    enabled_sources = sum(1 for s in sources if s.enabled)
    auto_publish_sources = sum(1 for s in sources if s.auto_publish)
    total_jobs = len(jobs)
    enabled_jobs = sum(1 for j in jobs if j.enabled)

    # Ping crawler service health check
    crawler_service_ok = False
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3) as client:
            from app.core.config import settings as app_settings
            crawler_health_url = f"{app_settings.crawler_service_url.rstrip('/')}/health"
            resp = await client.get(crawler_health_url)
            crawler_service_ok = resp.status_code == 200
    except Exception:
        pass

    # Count crawler posts from community bridge
    crawler_posts_total = 0
    try:
        from app.core.config import settings as app_settings
        import httpx
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(
                f"{app_settings.community_bridge_url.rstrip('/')}/admin/stats"
            )
            if resp.status_code == 200:
                bridge_stats = resp.json()
                crawler_posts_total = bridge_stats.get("crawler_posts", 0)
    except Exception:
        pass

    status_counts = {
        "running": 0,
        "success": 0,
        "failed": 0,
        "triggered": 0,
        "never": 0,
    }
    for source in sources:
        st = source.last_status
        if st in status_counts:
            status_counts[st] += 1
        else:
            status_counts["never"] += 1

    cron_stats = {
        "valid": 0,
        "invalid": 0,
        "missing": 0,
    }
    upcoming_runs = []
    now_utc = datetime.now(timezone.utc)
    next_24h = now_utc + timedelta(hours=24)
    scheduled_in_next_24h = 0

    for source in sources:
        if not source.schedule_cron:
            cron_stats["missing"] += 1
            continue

        try:
            trigger = CronTrigger.from_crontab(source.schedule_cron, timezone=timezone.utc)
            cron_stats["valid"] += 1
            next_run = trigger.get_next_fire_time(previous_fire_time=None, now=now_utc)
            if next_run and next_run <= next_24h:
                scheduled_in_next_24h += 1
            if source.enabled and next_run:
                upcoming_runs.append(
                    {
                        "source_id": source.id,
                        "source_name": source.name,
                        "next_run_at": next_run.isoformat(),
                        "schedule_cron": source.schedule_cron,
                    }
                )
        except Exception:
            cron_stats["invalid"] += 1

    for crawler_job in jobs:
        if not crawler_job.schedule_cron:
            cron_stats["missing"] += 1
            continue

        try:
            trigger = CronTrigger.from_crontab(crawler_job.schedule_cron, timezone=timezone.utc)
            cron_stats["valid"] += 1
            next_run = trigger.get_next_fire_time(previous_fire_time=None, now=now_utc)
            if next_run and next_run <= next_24h:
                scheduled_in_next_24h += 1
            if crawler_job.enabled and next_run:
                upcoming_runs.append(
                    {
                        "source_id": crawler_job.id,
                        "source_name": crawler_job.name,
                        "next_run_at": next_run.isoformat(),
                        "schedule_cron": crawler_job.schedule_cron,
                    }
                )
        except Exception:
            cron_stats["invalid"] += 1

    upcoming_runs.sort(key=lambda x: x["next_run_at"])
    upcoming_runs = upcoming_runs[:8]

    recent_runs = [
        {
            "source_id": s.id,
            "source_name": s.name,
            "last_run_at": s.last_run_at,
            "last_status": s.last_status,
        }
        for s in sorted(
            [item for item in sources if item.last_run_at is not None],
            key=lambda item: item.last_run_at,
            reverse=True,
        )[:8]
    ]

    scheduler_state = get_crawler_scheduler_state()

    return {
        "crawler_service_ok": crawler_service_ok,
        "crawler_posts_total": crawler_posts_total,
        "summary": {
            "total_sources": total_sources,
            "enabled_sources": enabled_sources,
            "disabled_sources": total_sources - enabled_sources,
            "auto_publish_sources": auto_publish_sources,
            "scheduled_in_next_24h": scheduled_in_next_24h,
            "total_jobs": total_jobs,
            "enabled_jobs": enabled_jobs,
        },
        "status_counts": status_counts,
        "cron_stats": cron_stats,
        "scheduler": scheduler_state,
        "upcoming_runs": upcoming_runs,
        "recent_runs": recent_runs,
    }


@router.get("/jobs")
async def list_crawler_jobs(
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    result = await session.exec(select(CrawlerJob).order_by(CrawlerJob.created_at.desc()))
    items = result.all()
    return {
        "items": [
            {
                "id": item.id,
                "job_key": item.job_key,
                "name": item.name,
                "description": parse_job_description(item.description)[0],
                "schedule_cron": item.schedule_cron,
                "enabled": item.enabled,
                "auto_publish": item.auto_publish,
                "posts_per_run": item.posts_per_run,
                "last_run_at": item.last_run_at,
                "last_status": item.last_status,
                "last_post_id": item.last_post_id,
                "target_sections": parse_job_description(item.description)[1],
                "created_at": item.created_at,
            }
            for item in items
        ]
    }


@router.put("/jobs/{job_id}")
async def update_crawler_job(
    job_id: str,
    req: CrawlerJobUpdate,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    crawler_job = await session.get(CrawlerJob, job_id)
    if not crawler_job:
        raise HTTPException(404, "Crawler job not found")

    update_data = req.model_dump(exclude_unset=True)
    existing_description, existing_sections = parse_job_description(crawler_job.description)

    target_sections = existing_sections
    if "target_sections" in update_data and update_data["target_sections"] is not None:
        target_sections = update_data.pop("target_sections")

    description = existing_description
    if "description" in update_data and update_data["description"] is not None:
        description = update_data.pop("description")

    if "target_sections" in req.model_fields_set or "description" in req.model_fields_set:
        crawler_job.description = build_job_description(description, target_sections)

    for key, value in update_data.items():
        setattr(crawler_job, key, value)

    session.add(crawler_job)
    await session.commit()
    await session.refresh(crawler_job)
    await reload_crawler_schedule_jobs()

    return {
        "id": crawler_job.id,
        "job_key": crawler_job.job_key,
        "name": crawler_job.name,
        "description": parse_job_description(crawler_job.description)[0],
        "schedule_cron": crawler_job.schedule_cron,
        "enabled": crawler_job.enabled,
        "auto_publish": crawler_job.auto_publish,
        "last_run_at": crawler_job.last_run_at,
        "last_status": crawler_job.last_status,
        "last_post_id": crawler_job.last_post_id,
        "target_sections": parse_job_description(crawler_job.description)[1],
        "created_at": crawler_job.created_at,
    }


@router.post("/jobs")
async def create_crawler_job(
    req: CrawlerJobCreate,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    import re, uuid
    job_key = re.sub(r"[^a-z0-9_]", "_", req.name.lower().strip())[:60] + "_" + uuid.uuid4().hex[:6]
    description = build_job_description(req.description or "", req.target_sections or [])
    job = CrawlerJob(
        job_key=job_key,
        name=req.name,
        description=description,
        schedule_cron=req.schedule_cron,
        enabled=req.enabled,
        auto_publish=req.auto_publish,
        posts_per_run=req.posts_per_run,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await reload_crawler_schedule_jobs()
    return {
        "id": job.id,
        "job_key": job.job_key,
        "name": job.name,
        "description": parse_job_description(job.description)[0],
        "schedule_cron": job.schedule_cron,
        "enabled": job.enabled,
        "auto_publish": job.auto_publish,
        "last_run_at": job.last_run_at,
        "last_status": job.last_status,
        "last_post_id": job.last_post_id,
        "target_sections": parse_job_description(job.description)[1],
        "created_at": job.created_at,
    }


@router.delete("/jobs/{job_id}")
async def delete_crawler_job(
    job_id: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    job = await session.get(CrawlerJob, job_id)
    if not job:
        raise HTTPException(404, "Crawler job not found")
    await session.delete(job)
    await session.commit()
    await reload_crawler_schedule_jobs()
    return {"ok": True}


@router.post("/jobs/{job_id}/trigger")
async def trigger_crawler_job(
    job_id: str,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    admin_id = str(getattr(admin, "id", "system"))
    admin_name = str(getattr(admin, "username", "system"))

    crawler_job = await session.get(CrawlerJob, job_id)
    if not crawler_job:
        raise HTTPException(404, "Crawler job not found")

    result = await execute_crawler_job(
        session=session,
        job=crawler_job,
        admin_id=admin_id,
        admin_name=admin_name,
        reason="Manual trigger",
    )
    return {
        "message": "Crawler job triggered",
        **result,
    }


@router.get("/")
async def list_crawler_sources(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = Query(None, description="Search by name, site_url, or rss_url"),
    enabled: Optional[bool] = None,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    query = select(CrawlerSource)
    count_query = select(func.count(CrawlerSource.id))
    if search:
        pattern = f"%{search}%"
        search_filter = (
            CrawlerSource.name.ilike(pattern)
            | CrawlerSource.site_url.ilike(pattern)
            | CrawlerSource.rss_url.ilike(pattern)
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)
    if enabled is not None:
        query = query.where(CrawlerSource.enabled == enabled)
        count_query = count_query.where(CrawlerSource.enabled == enabled)

    query = query.order_by(CrawlerSource.created_at.desc())

    total_result = await session.exec(count_query)
    total = total_result.one()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await session.exec(query)
    items = result.all()

    return {
        "items": [
            {
                "id": s.id,
                "name": s.name,
                "site_url": s.site_url,
                "rss_url": s.rss_url,
                "schedule_cron": s.schedule_cron,
                "enabled": s.enabled,
                "tags": s.tags,
                "auto_publish": s.auto_publish,
                "last_run_at": s.last_run_at,
                "last_status": s.last_status,
                "created_at": s.created_at,
            }
            for s in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/")
async def create_crawler_source(
    req: CrawlerSourceCreate,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    source = CrawlerSource(**req.model_dump())
    session.add(source)
    await session.commit()
    await session.refresh(source)
    await reload_crawler_schedule_jobs()
    return {
        "id": source.id,
        "name": source.name,
        "site_url": source.site_url,
        "rss_url": source.rss_url,
        "schedule_cron": source.schedule_cron,
        "enabled": source.enabled,
        "tags": source.tags,
        "auto_publish": source.auto_publish,
        "created_at": source.created_at,
    }


@router.get("/{source_id}")
async def get_crawler_source(
    source_id: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    source = await session.get(CrawlerSource, source_id)
    if not source:
        raise HTTPException(404, "Crawler source not found")
    return {
        "id": source.id,
        "name": source.name,
        "site_url": source.site_url,
        "rss_url": source.rss_url,
        "schedule_cron": source.schedule_cron,
        "enabled": source.enabled,
        "tags": source.tags,
        "auto_publish": source.auto_publish,
        "last_run_at": source.last_run_at,
        "last_status": source.last_status,
        "created_at": source.created_at,
    }


@router.put("/{source_id}")
async def update_crawler_source(
    source_id: str,
    req: CrawlerSourceUpdate,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    source = await session.get(CrawlerSource, source_id)
    if not source:
        raise HTTPException(404, "Crawler source not found")
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(source, key, value)
    session.add(source)
    await session.commit()
    await session.refresh(source)
    await reload_crawler_schedule_jobs()
    return {
        "id": source.id,
        "name": source.name,
        "site_url": source.site_url,
        "rss_url": source.rss_url,
        "schedule_cron": source.schedule_cron,
        "enabled": source.enabled,
        "tags": source.tags,
        "auto_publish": source.auto_publish,
        "last_run_at": source.last_run_at,
        "last_status": source.last_status,
        "created_at": source.created_at,
    }


@router.delete("/{source_id}")
async def delete_crawler_source(
    source_id: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    source = await session.get(CrawlerSource, source_id)
    if not source:
        raise HTTPException(404, "Crawler source not found")
    await session.delete(source)
    await session.commit()
    await reload_crawler_schedule_jobs()
    return {"message": "Crawler source deleted"}


@router.post("/{source_id}/trigger")
async def trigger_crawl(
    source_id: str,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    admin_id = str(getattr(admin, "id", "system"))
    admin_name = str(getattr(admin, "username", "system"))

    source = await session.get(CrawlerSource, source_id)
    if not source:
        raise HTTPException(404, "Crawler source not found")
    result = await execute_crawler_source(
        session=session,
        source=source,
        admin_id=admin_id,
        admin_name=admin_name,
        reason="Manual trigger",
    )
    return {
        "message": "Crawl triggered",
        **result,
    }
