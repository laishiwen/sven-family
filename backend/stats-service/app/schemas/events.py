from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional, Literal


class EventData(BaseModel):
    """Single event data"""
    type: Literal["page_view", "download", "app_open", "community_visit"]
    timestamp: int  # milliseconds since epoch

    # For page_view / community_visit
    page: Optional[str] = None
    referrer: Optional[str] = None

    # For download
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None

    # For desktop
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    cpu_arch: Optional[str] = None
    app_version: Optional[str] = None
    machine_info: Optional[dict] = None

    # For community
    community_user_id: Optional[str] = None


class TrackPayload(BaseModel):
    """Unified tracking payload"""
    source: Literal["site", "desktop", "community"]
    events: list[EventData]
    session_id: Optional[str] = None


class EventBatch(BaseModel):
    """Batch of events (legacy compat)"""
    events: list[EventData]
    session_id: Optional[str] = None


# Query params
class TimeRange(str):
    TODAY = "today"
    THREE_DAYS = "3d"
    SEVEN_DAYS = "7d"
    MONTH = "month"
    QUARTER = "quarter"
    YEAR = "year"
    ALL = "all"


# Response schemas
class StatsResponse(BaseModel):
    status: str = "ok"
    message: Optional[str] = None
    data: Optional[dict] = None


class VisitStats(BaseModel):
    total_visits: int
    unique_ips: int
    page_path: str = ""
    visit_count: int = 0


class DownloadStats(BaseModel):
    file_id: str
    file_name: str
    total_downloads: int
    total_size: Optional[int] = None


class TimeSeriesData(BaseModel):
    date: datetime
    count: int
    value: Optional[float] = None


class VisitDetailRow(BaseModel):
    id: int
    page_path: str
    user_ip: str
    user_ua: Optional[str]
    referrer: Optional[str]
    visited_at: datetime
    country: Optional[str]
    city: Optional[str]
    device_type: Optional[str]
