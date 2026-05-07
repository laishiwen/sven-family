import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlmodel import SQLModel, Field
from sqlalchemy import Column, String, JSON, Boolean, Integer


def gen_uuid():
    return str(uuid.uuid4())

def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AdminUser(SQLModel, table=True):
    __tablename__ = "admin_users"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    username: str = Field(sa_column=Column(String(50), unique=True, nullable=False))
    email: str = Field(sa_column=Column(String(255), unique=True, nullable=False))
    password_hash: str = Field(sa_column=Column(String(255), nullable=False))
    role: str = Field(default="moderator", sa_column=Column(String(20)))
    status: str = Field(default="active", sa_column=Column(String(20)))
    last_login_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class Membership(SQLModel, table=True):
    __tablename__ = "memberships"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    name: str = Field(sa_column=Column(String(100), nullable=False))
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_quarterly: Optional[float] = None
    price_yearly: Optional[float] = None
    features: Optional[str] = Field(default="[]", sa_column=Column(JSON))
    sort_order: int = Field(default=0)
    status: str = Field(default="active", sa_column=Column(String(20)))
    created_at: datetime = Field(default_factory=utcnow)


class UserSubscription(SQLModel, table=True):
    __tablename__ = "user_subscriptions"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    user_id: str = Field(sa_column=Column(String(50), nullable=False, index=True))
    membership_id: Optional[str] = Field(default=None, foreign_key="memberships.id")
    plan: str = Field(sa_column=Column(String(20), nullable=False))
    status: str = Field(default="active", sa_column=Column(String(20), index=True))
    started_at: datetime = Field(default_factory=utcnow)
    expires_at: datetime
    auto_renew: bool = Field(default=True, sa_column=Column(Boolean))
    cancelled_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class Order(SQLModel, table=True):
    __tablename__ = "orders"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    user_id: str = Field(sa_column=Column(String(50), nullable=False, index=True))
    subscription_id: Optional[str] = Field(default=None, foreign_key="user_subscriptions.id")
    membership_id: Optional[str] = Field(default=None, foreign_key="memberships.id")
    amount: float
    currency: str = Field(default="CNY", sa_column=Column(String(3)))
    plan: str = Field(sa_column=Column(String(20), nullable=False))
    status: str = Field(default="pending", sa_column=Column(String(20), index=True))
    payment_method: Optional[str] = Field(sa_column=Column(String(50)))
    payment_gateway_tx_id: Optional[str] = Field(sa_column=Column(String(255)))
    metadata_json: Optional[str] = Field(default="{}", sa_column=Column(JSON))
    paid_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=utcnow)


class Payment(SQLModel, table=True):
    __tablename__ = "payments"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    order_id: Optional[str] = Field(default=None, foreign_key="orders.id")
    gateway: str = Field(sa_column=Column(String(50), nullable=False))
    gateway_tx_id: str = Field(sa_column=Column(String(255), nullable=False, unique=True))
    amount: Optional[float] = None
    currency: Optional[str] = Field(default=None, sa_column=Column(String(3)))
    raw_callback: Optional[str] = Field(default="{}", sa_column=Column(JSON))
    status: str = Field(default="received", sa_column=Column(String(20)))
    created_at: datetime = Field(default_factory=utcnow)


class AuditLog(SQLModel, table=True):
    __tablename__ = "audit_logs"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    actor_type: str = Field(sa_column=Column(String(20), nullable=False, index=True))
    actor_id: str = Field(sa_column=Column(String(50), nullable=False, index=True))
    actor_name: Optional[str] = None
    action: str = Field(sa_column=Column(String(50), nullable=False, index=True))
    target_type: Optional[str] = Field(sa_column=Column(String(50), index=True))
    target_id: Optional[str] = Field(sa_column=Column(String(50), index=True))
    details: Optional[str] = Field(default="{}", sa_column=Column(JSON))
    ip: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime = Field(default_factory=utcnow)


class CrawlerSource(SQLModel, table=True):
    __tablename__ = "crawler_sources"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    name: str = Field(sa_column=Column(String(100), nullable=False))
    site_url: Optional[str] = Field(sa_column=Column(String(500)))
    rss_url: Optional[str] = Field(sa_column=Column(String(500)))
    schedule_cron: Optional[str] = Field(sa_column=Column(String(50)))
    enabled: bool = Field(default=True, sa_column=Column(Boolean))
    tags: Optional[str] = Field(default="[]", sa_column=Column(JSON))
    auto_publish: bool = Field(default=False, sa_column=Column(Boolean))
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = Field(sa_column=Column(String(20)))
    created_at: datetime = Field(default_factory=utcnow)


class CrawlerJob(SQLModel, table=True):
    __tablename__ = "crawler_jobs"
    id: str = Field(default_factory=gen_uuid, primary_key=True)
    job_key: str = Field(sa_column=Column(String(80), unique=True, nullable=False, index=True))
    name: str = Field(sa_column=Column(String(120), nullable=False))
    description: Optional[str] = Field(default=None, sa_column=Column(String(500)))
    schedule_cron: str = Field(default="0 */6 * * *", sa_column=Column(String(50), nullable=False))
    enabled: bool = Field(default=True, sa_column=Column(Boolean))
    auto_publish: bool = Field(default=False, sa_column=Column(Boolean))
    posts_per_run: int = Field(default=1, sa_column=Column(Integer, nullable=False))
    last_run_at: Optional[datetime] = None
    last_status: Optional[str] = Field(default=None, sa_column=Column(String(20)))
    last_post_id: Optional[str] = Field(default=None, sa_column=Column(String(100)))
    created_at: datetime = Field(default_factory=utcnow)


class PageView(SQLModel, table=True):
    __tablename__ = "page_views"
    id: Optional[int] = Field(default=None, primary_key=True)
    path: Optional[str] = Field(sa_column=Column(String(500)))
    referer: Optional[str] = None
    source: Optional[str] = Field(sa_column=Column(String(50)))
    ua: Optional[str] = None
    ip: Optional[str] = None
    country: Optional[str] = Field(sa_column=Column(String(5)))
    created_at: datetime = Field(default_factory=utcnow)


class Download(SQLModel, table=True):
    __tablename__ = "admin_downloads"
    id: Optional[int] = Field(default=None, primary_key=True)
    platform: Optional[str] = Field(sa_column=Column(String(20)))
    version: Optional[str] = Field(sa_column=Column(String(20)))
    ip: Optional[str] = None
    country: Optional[str] = Field(sa_column=Column(String(5)))
    created_at: datetime = Field(default_factory=utcnow)


class TelemetryEntry(SQLModel, table=True):
    __tablename__ = "telemetry"
    id: Optional[int] = Field(default=None, primary_key=True)
    machine_id: Optional[str] = Field(sa_column=Column(String(64), index=True))
    app_version: Optional[str] = Field(sa_column=Column(String(20)))
    os_type: Optional[str] = Field(sa_column=Column(String(20)))
    os_version: Optional[str] = Field(sa_column=Column(String(20)))
    ua: Optional[str] = None
    ip: Optional[str] = None
    reported_at: datetime = Field(default_factory=utcnow)
