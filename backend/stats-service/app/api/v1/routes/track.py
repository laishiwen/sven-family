import logging
from fastapi import APIRouter, Request, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_session
from app.schemas.events import TrackPayload, EventBatch, StatsResponse
from app.services.analytics import AnalyticsService, get_client_ip

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/track", tags=["tracking"])


@router.post("/event")
async def track_event(
    payload: TrackPayload,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Unified event tracking endpoint for all sources"""
    try:
        client_ip = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")
        service = AnalyticsService(session)
        await service.save_events(
            events=payload.events,
            client_ip=client_ip,
            user_agent=user_agent,
            source=payload.source,
            session_id=payload.session_id,
        )
        return StatsResponse(status="ok")
    except Exception as e:
        logger.error(f"Error tracking event: {e}")
        return StatsResponse(status="error", message=str(e))


@router.post("/events")
async def track_events(
    batch: EventBatch,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Legacy batch events endpoint (defaults to site source)"""
    try:
        client_ip = get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")
        service = AnalyticsService(session)
        # Legacy compat: default source=site for page_view/download events
        await service.save_events(
            events=batch.events,
            client_ip=client_ip,
            user_agent=user_agent,
            source="site",
            session_id=batch.session_id,
        )
        return StatsResponse(status="ok", message=f"Tracked {len(batch.events)} events")
    except Exception as e:
        logger.error(f"Error tracking events: {e}")
        return StatsResponse(status="error", message=str(e))
