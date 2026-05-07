from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text, Index
from sqlalchemy.dialects.postgresql import INET, JSONB


class PageVisit(SQLModel, table=True):
    """Page visit statistics - site landing page"""
    __tablename__ = "page_visits"

    id: Optional[int] = Field(default=None, primary_key=True)
    page_path: str = Field()
    user_ip: str = Field(sa_column=Column(INET))
    user_ua: Optional[str] = Field(default=None, sa_column=Column(Text))
    referrer: Optional[str] = None
    session_id: Optional[str] = None
    visited_at: datetime = Field(default_factory=datetime.utcnow)
    country: Optional[str] = None
    city: Optional[str] = None
    device_type: Optional[str] = None  # desktop/mobile/tablet
    dedup_key: Optional[str] = Field(default=None, index=True)

    __table_args__ = (
        Index("idx_visits_date", "visited_at"),
        Index("idx_visits_ip", "user_ip"),
        Index("idx_visits_page", "page_path"),
        Index("idx_visits_date_page", "visited_at", "page_path"),
        Index("idx_visits_session", "session_id"),
    )


class Download(SQLModel, table=True):
    """Download statistics - site landing page"""
    __tablename__ = "site_downloads"

    id: Optional[int] = Field(default=None, primary_key=True)
    file_id: str = Field()
    file_name: str
    file_size: Optional[int] = None
    user_ip: str = Field(sa_column=Column(INET))
    user_ua: Optional[str] = Field(default=None, sa_column=Column(Text))
    session_id: Optional[str] = None
    downloaded_at: datetime = Field(default_factory=datetime.utcnow)
    country: Optional[str] = None
    city: Optional[str] = None
    dedup_key: Optional[str] = Field(default=None, index=True)

    __table_args__ = (
        Index("idx_site_downloads_date", "downloaded_at"),
        Index("idx_site_downloads_file", "file_id"),
        Index("idx_site_downloads_ip", "user_ip"),
        Index("idx_site_downloads_date_file", "downloaded_at", "file_id"),
        Index("idx_site_downloads_session", "session_id"),
    )


class DesktopEvent(SQLModel, table=True):
    """Desktop app usage events - studio desktop"""
    __tablename__ = "desktop_events"

    id: Optional[int] = Field(default=None, primary_key=True)
    event_type: str = Field(default="app_open")  # app_open, app_close
    user_ip: str = Field(sa_column=Column(INET))
    user_ua: Optional[str] = Field(default=None, sa_column=Column(Text))
    session_id: Optional[str] = None
    machine_info: Optional[dict] = Field(default=None, sa_column=Column(JSONB))
    os_name: Optional[str] = None
    os_version: Optional[str] = None
    cpu_arch: Optional[str] = None
    app_version: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    country: Optional[str] = None
    city: Optional[str] = None
    dedup_key: Optional[str] = Field(default=None, index=True)

    __table_args__ = (
        Index("idx_desktop_date", "created_at"),
        Index("idx_desktop_ip", "user_ip"),
        Index("idx_desktop_session", "session_id"),
        Index("idx_desktop_date_type", "created_at", "event_type"),
    )


class CommunityVisit(SQLModel, table=True):
    """Community page visit events"""
    __tablename__ = "community_visits"

    id: Optional[int] = Field(default=None, primary_key=True)
    page_path: str = Field()
    user_ip: str = Field(sa_column=Column(INET))
    user_ua: Optional[str] = Field(default=None, sa_column=Column(Text))
    session_id: Optional[str] = None
    community_user_id: Optional[str] = None  # null = anonymous, set = registered
    referrer: Optional[str] = None
    visited_at: datetime = Field(default_factory=datetime.utcnow)
    country: Optional[str] = None
    city: Optional[str] = None
    device_type: Optional[str] = None
    dedup_key: Optional[str] = Field(default=None, index=True)

    __table_args__ = (
        Index("idx_community_date", "visited_at"),
        Index("idx_community_ip", "user_ip"),
        Index("idx_community_user", "community_user_id"),
        Index("idx_community_session", "session_id"),
        Index("idx_community_date_page", "visited_at", "page_path"),
    )


class SessionInfo(SQLModel, table=True):
    """Session tracking"""
    __tablename__ = "session_info"

    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: str = Field(unique=True, index=True)
    user_ip: str = Field(sa_column=Column(INET))
    user_ua: Optional[str] = Field(sa_column=Column(Text))
    first_visit: datetime = Field(default_factory=datetime.utcnow)
    last_visit: datetime = Field(default_factory=datetime.utcnow)
    visit_count: int = 0
    country: Optional[str] = None
    city: Optional[str] = None
