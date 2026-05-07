from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models.admin import PageView, Download, TelemetryEntry
from app.middleware.auth import get_current_admin

router = APIRouter()


def parse_date_range(start: Optional[str], end: Optional[str]):
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if end:
        end_dt = datetime.fromisoformat(end)
        if end_dt.tzinfo is not None:
            end_dt = end_dt.replace(tzinfo=None)
    else:
        end_dt = now
    if start:
        start_dt = datetime.fromisoformat(start)
        if start_dt.tzinfo is not None:
            start_dt = start_dt.replace(tzinfo=None)
    else:
        start_dt = now - timedelta(days=30)
    return start_dt, end_dt


@router.get("/page-views")
async def get_page_views(
    start: Optional[str] = Query(None, description="ISO format start date"),
    end: Optional[str] = Query(None, description="ISO format end date"),
    path: Optional[str] = None,
    source: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    start_dt, end_dt = parse_date_range(start, end)
    query = select(PageView).where(
        PageView.created_at >= start_dt,
        PageView.created_at <= end_dt,
    )
    if path:
        query = query.where(PageView.path == path)
    if source:
        query = query.where(PageView.source == source)
    query = query.order_by(PageView.created_at.desc())

    result = await session.exec(query)
    items = result.all()

    total_result = await session.exec(
        select(func.count(PageView.id)).where(
            PageView.created_at >= start_dt,
            PageView.created_at <= end_dt,
        )
    )
    total = total_result.one()

    top_paths_result = await session.exec(
        select(PageView.path, func.count(PageView.id).label("cnt"))
        .where(
            PageView.created_at >= start_dt,
            PageView.created_at <= end_dt,
        )
        .group_by(PageView.path)
        .order_by(func.count(PageView.id).desc())
        .limit(10)
    )
    top_paths = [{"path": r[0], "count": r[1]} for r in top_paths_result]

    return {
        "items": [
            {
                "id": v.id,
                "path": v.path,
                "referer": v.referer,
                "source": v.source,
                "ua": v.ua,
                "country": v.country,
                "created_at": v.created_at,
            }
            for v in items
        ],
        "total": total,
        "top_paths": top_paths,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
    }


@router.get("/page-views/timeline")
async def get_page_view_timeline(
    start: Optional[str] = Query(None, description="ISO format start date"),
    end: Optional[str] = Query(None, description="ISO format end date"),
    granularity: str = Query("day", pattern="^(hour|day|week|month)$"),
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    start_dt, end_dt = parse_date_range(start, end)
    query = select(PageView).where(
        PageView.created_at >= start_dt,
        PageView.created_at <= end_dt,
    )
    result = await session.exec(query)
    items = result.all()

    timeline = {}
    for v in items:
        if granularity == "hour":
            key = v.created_at.strftime("%Y-%m-%d %H:00")
        elif granularity == "day":
            key = v.created_at.strftime("%Y-%m-%d")
        elif granularity == "week":
            key = v.created_at.strftime("%Y-W%W")
        else:
            key = v.created_at.strftime("%Y-%m")
        timeline[key] = timeline.get(key, 0) + 1

    return {
        "timeline": [{"date": k, "count": v} for k, v in sorted(timeline.items())],
        "granularity": granularity,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
    }


@router.get("/downloads")
async def get_downloads(
    start: Optional[str] = Query(None, description="ISO format start date"),
    end: Optional[str] = Query(None, description="ISO format end date"),
    platform: Optional[str] = None,
    version: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    start_dt, end_dt = parse_date_range(start, end)
    query = select(Download).where(
        Download.created_at >= start_dt,
        Download.created_at <= end_dt,
    )
    if platform:
        query = query.where(Download.platform == platform)
    if version:
        query = query.where(Download.version == version)
    query = query.order_by(Download.created_at.desc())

    result = await session.exec(query)
    items = result.all()

    total_result = await session.exec(
        select(func.count(Download.id)).where(
            Download.created_at >= start_dt,
            Download.created_at <= end_dt,
        )
    )
    total = total_result.one()

    by_platform_result = await session.exec(
        select(Download.platform, func.count(Download.id).label("cnt"))
        .where(
            Download.created_at >= start_dt,
            Download.created_at <= end_dt,
        )
        .group_by(Download.platform)
        .order_by(func.count(Download.id).desc())
    )
    by_platform = {r[0] or "unknown": r[1] for r in by_platform_result}

    by_version_result = await session.exec(
        select(Download.version, func.count(Download.id).label("cnt"))
        .where(
            Download.created_at >= start_dt,
            Download.created_at <= end_dt,
        )
        .group_by(Download.version)
        .order_by(func.count(Download.id).desc())
    )
    by_version = {r[0] or "unknown": r[1] for r in by_version_result}

    return {
        "items": [
            {
                "id": d.id,
                "platform": d.platform,
                "version": d.version,
                "country": d.country,
                "created_at": d.created_at,
            }
            for d in items
        ],
        "total": total,
        "by_platform": by_platform,
        "by_version": by_version,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
    }


@router.get("/overview")
async def analytics_overview(
    start: Optional[str] = Query(None, description="ISO format start date"),
    end: Optional[str] = Query(None, description="ISO format end date"),
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    start_dt, end_dt = parse_date_range(start, end)

    page_view_count_result = await session.exec(
        select(func.count(PageView.id)).where(
            PageView.created_at >= start_dt,
            PageView.created_at <= end_dt,
        )
    )
    page_view_count = page_view_count_result.one()

    download_count_result = await session.exec(
        select(func.count(Download.id)).where(
            Download.created_at >= start_dt,
            Download.created_at <= end_dt,
        )
    )
    download_count = download_count_result.one()

    telemetry_count_result = await session.exec(
        select(func.count(TelemetryEntry.id)).where(
            TelemetryEntry.reported_at >= start_dt,
            TelemetryEntry.reported_at <= end_dt,
        )
    )
    telemetry_count = telemetry_count_result.one()

    unique_ips_result = await session.exec(
        select(func.count(func.distinct(PageView.ip))).where(
            PageView.created_at >= start_dt,
            PageView.created_at <= end_dt,
        )
    )
    unique_ips = unique_ips_result.one()

    return {
        "page_views": page_view_count,
        "downloads": download_count,
        "telemetry_entries": telemetry_count,
        "unique_visitors": unique_ips,
        "start": start_dt.isoformat(),
        "end": end_dt.isoformat(),
    }
