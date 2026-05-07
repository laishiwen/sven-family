import hashlib
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, Date
from user_agents import parse as parse_ua
from app.models.event import PageVisit, Download, DesktopEvent, CommunityVisit, SessionInfo
from app.schemas.events import EventData, TimeSeriesData

logger = logging.getLogger(__name__)

# Time range mapping to timedelta
TIME_RANGE_MAP = {
    "today": timedelta(days=1),
    "3d": timedelta(days=3),
    "7d": timedelta(days=7),
    "month": timedelta(days=30),
    "quarter": timedelta(days=90),
    "year": timedelta(days=365),
    "all": None,
}


def get_client_ip(request) -> str:
    """Extract client IP from request"""
    if x_forwarded_for := request.headers.get("X-Forwarded-For"):
        return x_forwarded_for.split(",")[0].strip()
    if x_real_ip := request.headers.get("X-Real-IP"):
        return x_real_ip
    return request.client.host if request.client else "0.0.0.0"


def parse_user_agent(user_agent: str) -> tuple[str, str]:
    """Parse user agent to get device type and browser"""
    ua = parse_ua(user_agent)
    device = "desktop"
    if ua.is_mobile:
        device = "mobile"
    elif ua.is_tablet:
        device = "tablet"
    return device, str(ua)


def make_dedup_key(*parts: str) -> str:
    """Generate a deduplication key"""
    raw = "|".join(p for p in parts if p)
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def resolve_time_range(time_range: str) -> tuple[datetime, datetime]:
    """Resolve a time range string to start/end datetimes"""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    delta = TIME_RANGE_MAP.get(time_range)
    if delta is None:
        return datetime(2000, 1, 1), now
    return now - delta, now


class AnalyticsService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self._new_sessions: set[str] = set()

    # ── Dedup check ─────────────────────────────────────────────────────────

    async def _is_duplicate(self, model_class, dedup_key: str) -> bool:
        """Check if an event with this dedup key already exists"""
        if not dedup_key:
            return False
        query = select(func.count()).select_from(model_class).where(
            model_class.dedup_key == dedup_key
        )
        result = await self.session.execute(query)
        return result.scalar() > 0

    # ── Track: Site page view ───────────────────────────────────────────────

    async def track_page_view(
        self,
        page: str,
        client_ip: str,
        user_agent: str,
        referrer: Optional[str] = None,
        session_id: Optional[str] = None,
        country: Optional[str] = None,
        city: Optional[str] = None,
    ) -> Optional[PageVisit]:
        # Dedup: same session + IP + page + hour window
        hour_key = datetime.utcnow().strftime("%Y%m%d%H")
        dedup_key = make_dedup_key("page_view", session_id or "", client_ip, page, hour_key)
        if await self._is_duplicate(PageVisit, dedup_key):
            return None

        device_type, ua_string = parse_user_agent(user_agent)

        visit = PageVisit(
            page_path=page,
            user_ip=client_ip,
            user_ua=ua_string,
            referrer=referrer,
            session_id=session_id,
            country=country,
            city=city,
            device_type=device_type,
            dedup_key=dedup_key,
        )
        self.session.add(visit)

        if session_id:
            await self._update_session(session_id, client_ip, ua_string, country, city)

        return visit

    # ── Track: Download ─────────────────────────────────────────────────────

    async def track_download(
        self,
        file_id: str,
        file_name: str,
        client_ip: str,
        user_agent: str,
        file_size: Optional[int] = None,
        session_id: Optional[str] = None,
        country: Optional[str] = None,
        city: Optional[str] = None,
    ) -> Optional[Download]:
        hour_key = datetime.utcnow().strftime("%Y%m%d%H")
        dedup_key = make_dedup_key("download", session_id or "", client_ip, file_id, hour_key)
        if await self._is_duplicate(Download, dedup_key):
            return None

        _, ua_string = parse_user_agent(user_agent)
        download = Download(
            file_id=file_id,
            file_name=file_name,
            file_size=file_size,
            user_ip=client_ip,
            user_ua=ua_string,
            session_id=session_id,
            country=country,
            city=city,
            dedup_key=dedup_key,
        )
        self.session.add(download)

        if session_id:
            await self._update_session(session_id, client_ip, ua_string, country, city)

        return download

    # ── Track: Desktop event ────────────────────────────────────────────────

    async def track_desktop_event(
        self,
        event_type: str,
        client_ip: str,
        user_agent: str,
        session_id: Optional[str] = None,
        os_name: Optional[str] = None,
        os_version: Optional[str] = None,
        cpu_arch: Optional[str] = None,
        app_version: Optional[str] = None,
        machine_info: Optional[dict] = None,
        country: Optional[str] = None,
        city: Optional[str] = None,
    ) -> Optional[DesktopEvent]:
        hour_key = datetime.utcnow().strftime("%Y%m%d%H")
        dedup_key = make_dedup_key("desktop", event_type, session_id or "", client_ip, hour_key)
        if await self._is_duplicate(DesktopEvent, dedup_key):
            return None

        event = DesktopEvent(
            event_type=event_type,
            user_ip=client_ip,
            user_ua=user_agent,
            session_id=session_id,
            os_name=os_name,
            os_version=os_version,
            cpu_arch=cpu_arch,
            app_version=app_version,
            machine_info=machine_info,
            country=country,
            city=city,
            dedup_key=dedup_key,
        )
        self.session.add(event)
        return event

    # ── Track: Community visit ──────────────────────────────────────────────

    async def track_community_visit(
        self,
        page: str,
        client_ip: str,
        user_agent: str,
        session_id: Optional[str] = None,
        community_user_id: Optional[str] = None,
        referrer: Optional[str] = None,
        country: Optional[str] = None,
        city: Optional[str] = None,
    ) -> Optional[CommunityVisit]:
        hour_key = datetime.utcnow().strftime("%Y%m%d%H")
        dedup_key = make_dedup_key("community", session_id or "", client_ip, page, hour_key)
        if await self._is_duplicate(CommunityVisit, dedup_key):
            return None

        device_type, ua_string = parse_user_agent(user_agent)
        visit = CommunityVisit(
            page_path=page,
            user_ip=client_ip,
            user_ua=ua_string,
            session_id=session_id,
            community_user_id=community_user_id,
            referrer=referrer,
            country=country,
            city=city,
            device_type=device_type,
            dedup_key=dedup_key,
        )
        self.session.add(visit)
        return visit

    # ── Session ─────────────────────────────────────────────────────────────

    async def _update_session(
        self,
        session_id: str,
        client_ip: str,
        user_agent: str,
        country: Optional[str] = None,
        city: Optional[str] = None,
    ):
        if session_id in self._new_sessions:
            return

        # Prevent duplicate pending rows in the same transaction.
        for pending in self.session.new:
            if isinstance(pending, SessionInfo) and pending.session_id == session_id:
                pending.last_visit = datetime.utcnow()
                pending.visit_count += 1
                self._new_sessions.add(session_id)
                return

        query = select(SessionInfo).where(SessionInfo.session_id == session_id)
        result = await self.session.execute(query)
        session_info = result.scalars().first()

        if session_info:
            session_info.last_visit = datetime.utcnow()
            session_info.visit_count += 1
        else:
            session_info = SessionInfo(
                session_id=session_id,
                user_ip=client_ip,
                user_ua=user_agent,
                country=country,
                city=city,
                visit_count=1,
            )
            self.session.add(session_info)
            self._new_sessions.add(session_id)

    # ── Unified save ────────────────────────────────────────────────────────

    async def save_events(
        self, events: list[EventData], client_ip: str, user_agent: str,
        source: str = "site", session_id: Optional[str] = None,
    ):
        """Save events, routing by source"""
        saved = 0
        for event in events:
            if source == "site":
                if event.type == "page_view":
                    r = await self.track_page_view(
                        page=event.page or "/",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        referrer=event.referrer,
                        session_id=session_id,
                    )
                elif event.type == "download":
                    r = await self.track_download(
                        file_id=event.file_id or "unknown",
                        file_name=event.file_name or "unknown",
                        client_ip=client_ip,
                        user_agent=user_agent,
                        file_size=event.file_size,
                        session_id=session_id,
                    )
                else:
                    continue
            elif source == "desktop":
                r = await self.track_desktop_event(
                    event_type=event.type or "app_open",
                    client_ip=client_ip,
                    user_agent=user_agent,
                    session_id=session_id,
                    os_name=event.os_name,
                    os_version=event.os_version,
                    cpu_arch=event.cpu_arch,
                    app_version=event.app_version,
                    machine_info=event.machine_info,
                )
            elif source == "community":
                r = await self.track_community_visit(
                    page=event.page or "/",
                    client_ip=client_ip,
                    user_agent=user_agent,
                    session_id=session_id,
                    community_user_id=event.community_user_id,
                    referrer=event.referrer,
                )
            else:
                continue
            if r is not None:
                saved += 1

        await self.session.commit()
        logger.info(f"Saved {saved}/{len(events)} events (source={source})")

    # ── Query: Site visits ──────────────────────────────────────────────────

    async def get_visit_stats(self, start_date: datetime, end_date: datetime) -> dict:
        query = select(
            func.count(PageVisit.id).label("total_visits"),
            func.count(func.distinct(PageVisit.user_ip)).label("unique_ips"),
        ).where(and_(PageVisit.visited_at >= start_date, PageVisit.visited_at <= end_date))
        result = await self.session.execute(query)
        row = result.first()
        return {
            "total_visits": row[0] or 0,
            "unique_ips": row[1] or 0,
        }

    async def get_download_stats(
        self, start_date: datetime, end_date: datetime, file_id: Optional[str] = None,
    ) -> dict:
        query = select(
            Download.file_id, Download.file_name,
            func.count(Download.id).label("total_downloads"),
            func.sum(Download.file_size).label("total_size"),
        ).where(and_(Download.downloaded_at >= start_date, Download.downloaded_at <= end_date))
        if file_id:
            query = query.where(Download.file_id == file_id)
        query = query.group_by(Download.file_id, Download.file_name)
        result = await self.session.execute(query)
        rows = result.all()
        return {
            "data": [
                {"file_id": r[0], "file_name": r[1], "total_downloads": r[2], "total_size": r[3]}
                for r in rows
            ],
        }

    async def get_page_stats(
        self, start_date: datetime, end_date: datetime, limit: int = 10,
    ) -> list[dict]:
        query = (
            select(
                PageVisit.page_path,
                func.count(PageVisit.id).label("visit_count"),
                func.count(func.distinct(PageVisit.user_ip)).label("unique_ips"),
            )
            .where(and_(PageVisit.visited_at >= start_date, PageVisit.visited_at <= end_date))
            .group_by(PageVisit.page_path)
            .order_by(func.count(PageVisit.id).desc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return [
            {"page_path": r[0], "visit_count": r[1], "unique_ips": r[2]}
            for r in result.all()
        ]

    async def get_daily_trend(self, start_date: datetime, end_date: datetime) -> list[TimeSeriesData]:
        query = (
            select(
                cast(PageVisit.visited_at, Date).label("date"),
                func.count(PageVisit.id).label("count"),
            )
            .where(and_(PageVisit.visited_at >= start_date, PageVisit.visited_at <= end_date))
            .group_by(cast(PageVisit.visited_at, Date))
            .order_by(cast(PageVisit.visited_at, Date))
        )
        result = await self.session.execute(query)
        return [TimeSeriesData(date=r[0], count=r[1]) for r in result.all()]

    async def get_visitor_details(
        self, skip: int = 0, limit: int = 50,
        filter_ip: Optional[str] = None, filter_page: Optional[str] = None,
    ) -> tuple[list[dict], int]:
        base = select(PageVisit)
        count_base = select(func.count(PageVisit.id)).select_from(PageVisit)
        if filter_ip:
            base = base.where(PageVisit.user_ip == filter_ip)
            count_base = count_base.where(PageVisit.user_ip == filter_ip)
        if filter_page:
            base = base.where(PageVisit.page_path.contains(filter_page))
            count_base = count_base.where(PageVisit.page_path.contains(filter_page))

        total = (await self.session.execute(count_base)).scalar() or 0
        rows = (await self.session.execute(
            base.order_by(PageVisit.visited_at.desc()).offset(skip).limit(limit)
        )).scalars().all()

        return [
            {
                "id": r.id, "page_path": r.page_path, "user_ip": r.user_ip,
                "user_ua": r.user_ua, "referrer": r.referrer,
                "visited_at": r.visited_at.isoformat(),
                "country": r.country, "city": r.city, "device_type": r.device_type,
            }
            for r in rows
        ], total

    # ── Query: Desktop stats ────────────────────────────────────────────────

    async def get_desktop_stats(self, start_date: datetime, end_date: datetime) -> dict:
        query = select(
            func.count(DesktopEvent.id).label("total_events"),
            func.count(func.distinct(DesktopEvent.user_ip)).label("unique_ips"),
            func.count(func.distinct(DesktopEvent.session_id)).label("unique_sessions"),
        ).where(and_(DesktopEvent.created_at >= start_date, DesktopEvent.created_at <= end_date))
        result = await self.session.execute(query)
        row = result.first()
        return {
            "total_events": row[0] or 0,
            "unique_ips": row[1] or 0,
            "unique_sessions": row[2] or 0,
        }

    async def get_desktop_trend(self, start_date: datetime, end_date: datetime) -> list[TimeSeriesData]:
        query = (
            select(
                cast(DesktopEvent.created_at, Date).label("date"),
                func.count(DesktopEvent.id).label("count"),
            )
            .where(and_(DesktopEvent.created_at >= start_date, DesktopEvent.created_at <= end_date))
            .group_by(cast(DesktopEvent.created_at, Date))
            .order_by(cast(DesktopEvent.created_at, Date))
        )
        result = await self.session.execute(query)
        return [TimeSeriesData(date=r[0], count=r[1]) for r in result.all()]

    async def get_desktop_platforms(self, start_date: datetime, end_date: datetime) -> list[dict]:
        query = (
            select(
                DesktopEvent.os_name,
                func.count(DesktopEvent.id).label("count"),
            )
            .where(and_(DesktopEvent.created_at >= start_date, DesktopEvent.created_at <= end_date))
            .group_by(DesktopEvent.os_name)
            .order_by(func.count(DesktopEvent.id).desc())
        )
        result = await self.session.execute(query)
        return [{"os": r[0] or "unknown", "count": r[1]} for r in result.all()]

    # ── Query: Community stats ──────────────────────────────────────────────

    async def get_community_stats(self, start_date: datetime, end_date: datetime) -> dict:
        query = select(
            func.count(CommunityVisit.id).label("total_visits"),
            func.count(func.distinct(CommunityVisit.user_ip)).label("unique_ips"),
            func.count(func.distinct(CommunityVisit.session_id)).label("unique_sessions"),
        ).where(and_(CommunityVisit.visited_at >= start_date, CommunityVisit.visited_at <= end_date))
        query_anon = select(func.count(CommunityVisit.id)).where(
            and_(
                CommunityVisit.visited_at >= start_date,
                CommunityVisit.visited_at <= end_date,
                CommunityVisit.community_user_id.is_(None),
            )
        )
        query_reg = select(func.count(CommunityVisit.id)).where(
            and_(
                CommunityVisit.visited_at >= start_date,
                CommunityVisit.visited_at <= end_date,
                CommunityVisit.community_user_id.isnot(None),
            )
        )

        result = await self.session.execute(query)
        row = result.first()
        anon = (await self.session.execute(query_anon)).scalar() or 0
        reg = (await self.session.execute(query_reg)).scalar() or 0

        return {
            "total_visits": row[0] or 0,
            "unique_ips": row[1] or 0,
            "unique_sessions": row[2] or 0,
            "anonymous_visits": anon,
            "registered_visits": reg,
        }

    async def get_community_trend(self, start_date: datetime, end_date: datetime) -> list[dict]:
        query = (
            select(
                cast(CommunityVisit.visited_at, Date).label("date"),
                func.count(CommunityVisit.id).label("count"),
                func.sum(
                    func.case(
                        (CommunityVisit.community_user_id.isnot(None), 1),
                        else_=0,
                    )
                ).label("registered"),
                func.sum(
                    func.case(
                        (CommunityVisit.community_user_id.is_(None), 1),
                        else_=0,
                    )
                ).label("anonymous"),
            )
            .where(and_(CommunityVisit.visited_at >= start_date, CommunityVisit.visited_at <= end_date))
            .group_by(cast(CommunityVisit.visited_at, Date))
            .order_by(cast(CommunityVisit.visited_at, Date))
        )
        result = await self.session.execute(query)
        return [
            {"date": str(r[0]), "count": r[1], "registered": r[2] or 0, "anonymous": r[3] or 0}
            for r in result.all()
        ]

    async def get_community_top_pages(
        self, start_date: datetime, end_date: datetime, limit: int = 10,
    ) -> list[dict]:
        query = (
            select(
                CommunityVisit.page_path,
                func.count(CommunityVisit.id).label("visit_count"),
                func.count(func.distinct(CommunityVisit.user_ip)).label("unique_ips"),
            )
            .where(and_(CommunityVisit.visited_at >= start_date, CommunityVisit.visited_at <= end_date))
            .group_by(CommunityVisit.page_path)
            .order_by(func.count(CommunityVisit.id).desc())
            .limit(limit)
        )
        result = await self.session.execute(query)
        return [
            {"page_path": r[0], "visit_count": r[1], "unique_ips": r[2]}
            for r in result.all()
        ]

    # ── Detail queries ─────────────────────────────────────────────────────

    async def get_desktop_details(
        self, skip: int = 0, limit: int = 50,
    ) -> tuple[list[dict], int]:
        base = select(DesktopEvent)
        count_base = select(func.count(DesktopEvent.id)).select_from(DesktopEvent)
        total = (await self.session.execute(count_base)).scalar() or 0
        rows = (await self.session.execute(
            base.order_by(DesktopEvent.created_at.desc()).offset(skip).limit(limit)
        )).scalars().all()
        return [
            {
                "id": r.id, "event_type": r.event_type,
                "user_ip": str(r.user_ip), "user_ua": r.user_ua,
                "session_id": r.session_id,
                "os_name": r.os_name, "os_version": r.os_version,
                "cpu_arch": r.cpu_arch, "app_version": r.app_version,
                "machine_info": r.machine_info,
                "created_at": r.created_at.isoformat(),
                "country": r.country, "city": r.city,
            }
            for r in rows
        ], total

    async def get_community_details(
        self, skip: int = 0, limit: int = 50,
    ) -> tuple[list[dict], int]:
        base = select(CommunityVisit)
        count_base = select(func.count(CommunityVisit.id)).select_from(CommunityVisit)
        total = (await self.session.execute(count_base)).scalar() or 0
        rows = (await self.session.execute(
            base.order_by(CommunityVisit.visited_at.desc()).offset(skip).limit(limit)
        )).scalars().all()
        return [
            {
                "id": r.id, "page_path": r.page_path,
                "user_ip": str(r.user_ip), "user_ua": r.user_ua,
                "session_id": r.session_id,
                "community_user_id": r.community_user_id,
                "referrer": r.referrer,
                "visited_at": r.visited_at.isoformat(),
                "country": r.country, "city": r.city,
                "device_type": r.device_type,
            }
            for r in rows
        ], total
