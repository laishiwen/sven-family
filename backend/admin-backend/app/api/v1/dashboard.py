from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models.admin import (
    AdminUser,
    Membership,
    UserSubscription,
    Order,
    AuditLog,
    CrawlerSource,
    PageView,
    Download,
    TelemetryEntry,
)
from app.middleware.auth import get_current_admin

router = APIRouter()


@router.get("/stats")
async def dashboard_stats(
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    admin_count_result = await session.exec(select(func.count(AdminUser.id)))
    admin_count = admin_count_result.one()

    membership_count_result = await session.exec(select(func.count(Membership.id)))
    membership_count = membership_count_result.one()

    sub_count_result = await session.exec(
        select(func.count(UserSubscription.id)).where(UserSubscription.status == "active")
    )
    active_subs = sub_count_result.one()

    order_count_result = await session.exec(select(func.count(Order.id)))
    order_count = order_count_result.one()

    pending_order_count_result = await session.exec(
        select(func.count(Order.id)).where(Order.status == "pending")
    )
    pending_orders = pending_order_count_result.one()

    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)

    orders_today_result = await session.exec(
        select(func.count(Order.id)).where(Order.created_at >= today_start)
    )
    orders_today = orders_today_result.one()

    views_today_result = await session.exec(
        select(func.count(PageView.id)).where(PageView.created_at >= today_start)
    )
    views_today = views_today_result.one()

    downloads_today_result = await session.exec(
        select(func.count(Download.id)).where(Download.created_at >= today_start)
    )
    downloads_today = downloads_today_result.one()

    crawler_count_result = await session.exec(select(func.count(CrawlerSource.id)))
    crawler_count = crawler_count_result.one()

    audit_count_result = await session.exec(select(func.count(AuditLog.id)))
    audit_count = audit_count_result.one()

    telemetry_count_result = await session.exec(select(func.count(TelemetryEntry.id)))
    telemetry_count = telemetry_count_result.one()

    return {
        "admin_count": admin_count,
        "membership_count": membership_count,
        "active_subscriptions": active_subs,
        "total_orders": order_count,
        "pending_orders": pending_orders,
        "orders_today": orders_today,
        "page_views_today": views_today,
        "downloads_today": downloads_today,
        "crawler_sources": crawler_count,
        "audit_logs": audit_count,
        "telemetry_entries": telemetry_count,
    }
