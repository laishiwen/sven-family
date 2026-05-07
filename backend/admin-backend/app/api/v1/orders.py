from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models.admin import Order, Payment, UserSubscription
from app.middleware.auth import get_current_admin
from app.middleware.audit import log_admin_action
from app.middleware.idempotency import check_idempotency, cache_idempotency

router = APIRouter()


class OrderRefundRequest(BaseModel):
    reason: str


@router.get("/")
async def list_orders(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    plan: Optional[str] = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    query = select(Order)
    count_query = select(func.count(Order.id))

    if status:
        query = query.where(Order.status == status)
    if user_id:
        query = query.where(Order.user_id == user_id)
    if plan:
        query = query.where(Order.plan == plan)

    if sort_desc:
        query = query.order_by(getattr(Order, sort_by).desc())
    else:
        query = query.order_by(getattr(Order, sort_by).asc())

    total_result = await session.exec(count_query)
    total = total_result.one()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await session.exec(query)
    items = result.all()

    return {
        "items": [
            {
                "id": o.id,
                "user_id": o.user_id,
                "subscription_id": o.subscription_id,
                "membership_id": o.membership_id,
                "amount": o.amount,
                "currency": o.currency,
                "plan": o.plan,
                "status": o.status,
                "payment_method": o.payment_method,
                "payment_gateway_tx_id": o.payment_gateway_tx_id,
                "metadata_json": o.metadata_json,
                "paid_at": o.paid_at,
                "created_at": o.created_at,
            }
            for o in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{order_id}")
async def get_order(
    order_id: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Order not found")

    payments_result = await session.exec(
        select(Payment).where(Payment.order_id == order_id)
    )
    payments = payments_result.all()

    return {
        "id": order.id,
        "user_id": order.user_id,
        "subscription_id": order.subscription_id,
        "membership_id": order.membership_id,
        "amount": order.amount,
        "currency": order.currency,
        "plan": order.plan,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_gateway_tx_id": order.payment_gateway_tx_id,
        "metadata_json": order.metadata_json,
        "paid_at": order.paid_at,
        "created_at": order.created_at,
        "payments": [
            {
                "id": p.id,
                "gateway": p.gateway,
                "gateway_tx_id": p.gateway_tx_id,
                "amount": p.amount,
                "currency": p.currency,
                "status": p.status,
                "created_at": p.created_at,
            }
            for p in payments
        ],
    }


@router.post("/{order_id}/refund")
async def refund_order(
    order_id: str,
    req: OrderRefundRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    # Idempotency-Key support: return cached response if same key seen before
    cached = await check_idempotency(request)
    if cached:
        return cached

    order = await session.get(Order, order_id)
    if not order:
        raise HTTPException(404, "Order not found")

    if order.status in ("refunded", "cancelled"):
        raise HTTPException(400, f"Order is already {order.status}")

    order.status = "refunded"
    session.add(order)

    if order.subscription_id:
        sub = await session.get(UserSubscription, order.subscription_id)
        if sub:
            sub.status = "cancelled"
            sub.cancelled_at = datetime.now(timezone.utc).replace(tzinfo=None)
            session.add(sub)

    await session.commit()
    await session.refresh(order)
    result = {
        "id": order.id,
        "status": order.status,
        "message": "Order refunded",
        "reason": req.reason,
    }
    await cache_idempotency(request, result)

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="refund_order", target_type="order", target_id=order_id,
    )

    return result


@router.get("/stats/overview")
async def order_stats(
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    total_result = await session.exec(select(func.count(Order.id)))
    total = total_result.one()

    pending_result = await session.exec(
        select(func.count(Order.id)).where(Order.status == "pending")
    )
    pending = pending_result.one()

    paid_result = await session.exec(
        select(func.count(Order.id)).where(Order.status == "paid")
    )
    paid = paid_result.one()

    refunded_result = await session.exec(
        select(func.count(Order.id)).where(Order.status == "refunded")
    )
    refunded = refunded_result.one()

    cancelled_result = await session.exec(
        select(func.count(Order.id)).where(Order.status == "cancelled")
    )
    cancelled = cancelled_result.one()

    revenue_result = await session.exec(
        select(func.coalesce(func.sum(Order.amount), 0)).where(Order.status == "paid")
    )
    total_revenue = float(revenue_result.one() or 0)

    return {
        "total_orders": total,
        "pending": pending,
        "paid": paid,
        "refunded": refunded,
        "cancelled": cancelled,
        "total_revenue": total_revenue,
    }
