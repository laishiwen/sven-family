"""
Analytics query routes for admin dashboard
"""
import logging
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.services.analytics import AnalyticsService, resolve_time_range

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/stats", tags=["stats-query"])


def parse_dates(start_date: str = None, end_date: str = None, time_range: str = None):
    """Resolve start/end from explicit dates or time_range keyword"""
    if time_range:
        return resolve_time_range(time_range)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if not start_date:
        start_date = (now - timedelta(days=30)).isoformat()
    if not end_date:
        end_date = now.isoformat()
    return datetime.fromisoformat(start_date), datetime.fromisoformat(end_date)


# ── Site: Visits ────────────────────────────────────────────────────────────

@router.get("/site/visits")
async def get_site_visits(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None, description="today|3d|7d|month|quarter|year|all"),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        stats = await service.get_visit_stats(start, end)
        return {"status": "ok", "data": stats}
    except Exception as e:
        logger.error(f"Error getting site visits: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/site/trend")
async def get_site_trend(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None, description="today|3d|7d|month|quarter|year|all"),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        trend = await service.get_daily_trend(start, end)
        return {"status": "ok", "data": [{"date": str(t.date), "count": t.count} for t in trend]}
    except Exception as e:
        logger.error(f"Error getting site trend: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/site/top-pages")
async def get_site_top_pages(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    limit: int = Query(10, le=50),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        pages = await service.get_page_stats(start, end, limit)
        return {"status": "ok", "data": pages}
    except Exception as e:
        logger.error(f"Error getting top pages: {e}")
        return {"status": "error", "message": str(e)}


# ── Site: Downloads ─────────────────────────────────────────────────────────

@router.get("/site/downloads")
async def get_site_downloads(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    file_id: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        stats = await service.get_download_stats(start, end, file_id)
        return {"status": "ok", "data": stats}
    except Exception as e:
        logger.error(f"Error getting downloads: {e}")
        return {"status": "error", "message": str(e)}


# ── Desktop: Stats ──────────────────────────────────────────────────────────

@router.get("/desktop/stats")
async def get_desktop_stats(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None, description="today|3d|7d|month|quarter|year|all"),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        stats = await service.get_desktop_stats(start, end)
        return {"status": "ok", "data": stats}
    except Exception as e:
        logger.error(f"Error getting desktop stats: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/desktop/trend")
async def get_desktop_trend(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        trend = await service.get_desktop_trend(start, end)
        return {"status": "ok", "data": [{"date": str(t.date), "count": t.count} for t in trend]}
    except Exception as e:
        logger.error(f"Error getting desktop trend: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/desktop/platforms")
async def get_desktop_platforms(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        data = await service.get_desktop_platforms(start, end)
        return {"status": "ok", "data": data}
    except Exception as e:
        logger.error(f"Error getting desktop platforms: {e}")
        return {"status": "error", "message": str(e)}


# ── Community: Stats ────────────────────────────────────────────────────────

@router.get("/community/stats")
async def get_community_stats(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None, description="today|3d|7d|month|quarter|year|all"),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        stats = await service.get_community_stats(start, end)
        return {"status": "ok", "data": stats}
    except Exception as e:
        logger.error(f"Error getting community stats: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/community/trend")
async def get_community_trend(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        trend = await service.get_community_trend(start, end)
        return {"status": "ok", "data": trend}
    except Exception as e:
        logger.error(f"Error getting community trend: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/community/top-pages")
async def get_community_top_pages(
    start_date: str = Query(None),
    end_date: str = Query(None),
    time_range: str = Query(None),
    limit: int = Query(10, le=50),
    session: AsyncSession = Depends(get_session),
):
    try:
        start, end = parse_dates(start_date, end_date, time_range)
        service = AnalyticsService(session)
        pages = await service.get_community_top_pages(start, end, limit)
        return {"status": "ok", "data": pages}
    except Exception as e:
        logger.error(f"Error getting community top pages: {e}")
        return {"status": "error", "message": str(e)}


# ── Legacy compat ───────────────────────────────────────────────────────────

@router.get("/visits")
async def get_visit_stats_legacy(
    start_date: str = Query(...),
    end_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Legacy: get visit statistics summary"""
    return await get_site_visits(start_date=start_date, end_date=end_date, session=session)


@router.get("/downloads")
async def get_download_stats_legacy(
    start_date: str = Query(...),
    end_date: str = Query(...),
    file_id: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Legacy: get download statistics"""
    return await get_site_downloads(start_date=start_date, end_date=end_date, file_id=file_id, session=session)


@router.get("/top-pages")
async def get_top_pages_legacy(
    start_date: str = Query(...),
    end_date: str = Query(...),
    limit: int = Query(10, le=50),
    session: AsyncSession = Depends(get_session),
):
    """Legacy: get top pages"""
    return await get_site_top_pages(start_date=start_date, end_date=end_date, limit=limit, session=session)


@router.get("/daily-trend")
async def get_daily_trend_legacy(
    start_date: str = Query(...),
    end_date: str = Query(...),
    session: AsyncSession = Depends(get_session),
):
    """Legacy: get daily trend"""
    return await get_site_trend(start_date=start_date, end_date=end_date, session=session)


@router.get("/site/details")
async def get_site_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    session: AsyncSession = Depends(get_session),
):
    try:
        service = AnalyticsService(session)
        skip = (page - 1) * limit
        data, total = await service.get_visitor_details(skip, limit)
        return {"status": "ok", "data": data, "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}}
    except Exception as e:
        logger.error(f"Error getting site details: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/desktop/details")
async def get_desktop_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    session: AsyncSession = Depends(get_session),
):
    try:
        service = AnalyticsService(session)
        skip = (page - 1) * limit
        data, total = await service.get_desktop_details(skip, limit)
        return {"status": "ok", "data": data, "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}}
    except Exception as e:
        logger.error(f"Error getting desktop details: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/community/details")
async def get_community_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    session: AsyncSession = Depends(get_session),
):
    try:
        service = AnalyticsService(session)
        skip = (page - 1) * limit
        data, total = await service.get_community_details(skip, limit)
        return {"status": "ok", "data": data, "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit}}
    except Exception as e:
        logger.error(f"Error getting community details: {e}")
        return {"status": "error", "message": str(e)}


@router.get("/visitor-details")
async def get_visitor_details_legacy(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    filter_ip: str = Query(None),
    filter_page: str = Query(None),
    session: AsyncSession = Depends(get_session),
):
    """Legacy: get visitor details"""
    try:
        service = AnalyticsService(session)
        skip = (page - 1) * limit
        data, total = await service.get_visitor_details(skip, limit, filter_ip, filter_page)
        return {
            "status": "ok",
            "data": data,
            "pagination": {"page": page, "limit": limit, "total": total, "pages": (total + limit - 1) // limit},
        }
    except Exception as e:
        logger.error(f"Error getting visitor details: {e}")
        return {"status": "error", "message": str(e)}
