"""
Stats proxy routes — admin-backend proxies queries to stats-service.
Three sections: site (官网), desktop (桌面端), community (社区).
"""
from datetime import datetime, timedelta
from typing import Optional
import httpx
from fastapi import APIRouter, Depends, Query
from app.middleware.auth import get_current_admin

router = APIRouter()

from app.core.config import settings
STATS_SERVICE_URL = settings.stats_service_url


async def get_stats_client() -> httpx.AsyncClient:
    async with httpx.AsyncClient(base_url=STATS_SERVICE_URL, timeout=15) as client:
        yield client


async def _proxy_get(client: httpx.AsyncClient, path: str, **params) -> dict:
    """Generic proxy GET to stats-service, returns json or error dict."""
    clean = {k: v for k, v in params.items() if v is not None}
    try:
        resp = await client.get(path, params=clean)
        return resp.json() if resp.status_code < 500 else {"status": "error", "message": f"Stats service error {resp.status_code}"}
    except httpx.ConnectError:
        return {"status": "error", "message": "Stats service unreachable"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Site (官网) ──────────────────────────────────────────────────────────────

@router.get("/site/visits")
async def site_visits(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None, description="today|3d|7d|month|quarter|year|all"),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/site/visits",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/site/trend")
async def site_trend(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/site/trend",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/site/top-pages")
async def site_top_pages(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    limit: int = Query(10, le=50),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/site/top-pages",
        start_date=start_date, end_date=end_date, time_range=time_range, limit=limit)


@router.get("/site/downloads")
async def site_downloads(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    file_id: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/site/downloads",
        start_date=start_date, end_date=end_date, time_range=time_range, file_id=file_id)


# ── Desktop (桌面端) ─────────────────────────────────────────────────────────

@router.get("/desktop/stats")
async def desktop_stats(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/desktop/stats",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/desktop/trend")
async def desktop_trend(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/desktop/trend",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/desktop/platforms")
async def desktop_platforms(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/desktop/platforms",
        start_date=start_date, end_date=end_date, time_range=time_range)


# ── Community (社区) ─────────────────────────────────────────────────────────

@router.get("/community/stats")
async def community_stats(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/community/stats",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/community/trend")
async def community_trend(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/community/trend",
        start_date=start_date, end_date=end_date, time_range=time_range)


@router.get("/community/top-pages")
async def community_top_pages(
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    time_range: Optional[str] = Query(None),
    limit: int = Query(10, le=50),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/community/top-pages",
        start_date=start_date, end_date=end_date, time_range=time_range, limit=limit)


# ── Detail endpoints ────────────────────────────────────────────────────────

@router.get("/site/details")
async def site_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/site/details", page=page, limit=limit)


@router.get("/desktop/details")
async def desktop_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/desktop/details", page=page, limit=limit)


@router.get("/community/details")
async def community_details(
    page: int = Query(1, ge=1),
    limit: int = Query(50, le=100),
    client: httpx.AsyncClient = Depends(get_stats_client),
    _=Depends(get_current_admin),
):
    return await _proxy_get(client, "/api/v1/stats/community/details", page=page, limit=limit)
