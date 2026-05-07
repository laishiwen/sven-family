from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import select, func
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models.admin import Membership
from app.middleware.auth import get_current_admin
from app.middleware.audit import log_admin_action

router = APIRouter()


class MembershipCreate(BaseModel):
    name: str
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_quarterly: Optional[float] = None
    price_yearly: Optional[float] = None
    features: Optional[str] = "[]"
    sort_order: int = 0
    status: str = "active"


class MembershipUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[float] = None
    price_quarterly: Optional[float] = None
    price_yearly: Optional[float] = None
    features: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


@router.get("/")
async def list_memberships(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    query = select(Membership)
    if status:
        query = query.where(Membership.status == status)
    query = query.order_by(Membership.sort_order.asc(), Membership.created_at.desc())

    if status:
        count_result = await session.exec(
            select(func.count(Membership.id)).where(Membership.status == status)
        )
    else:
        count_result = await session.exec(select(func.count(Membership.id)))
    total = count_result.one()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)
    result = await session.exec(query)
    items = result.all()
    return {
        "items": [
            {
                "id": m.id,
                "name": m.name,
                "description": m.description,
                "price_monthly": m.price_monthly,
                "price_quarterly": m.price_quarterly,
                "price_yearly": m.price_yearly,
                "features": m.features,
                "sort_order": m.sort_order,
                "status": m.status,
                "created_at": m.created_at,
            }
            for m in items
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/")
async def create_membership(
    req: MembershipCreate,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    membership = Membership(**req.model_dump())
    session.add(membership)
    await session.commit()
    await session.refresh(membership)

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="create_membership", target_type="membership", target_id=membership.id,
    )

    return {
        "id": membership.id,
        "name": membership.name,
        "description": membership.description,
        "price_monthly": membership.price_monthly,
        "price_quarterly": membership.price_quarterly,
        "price_yearly": membership.price_yearly,
        "features": membership.features,
        "sort_order": membership.sort_order,
        "status": membership.status,
        "created_at": membership.created_at,
    }


@router.get("/{membership_id}")
async def get_membership(
    membership_id: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    membership = await session.get(Membership, membership_id)
    if not membership:
        raise HTTPException(404, "Membership not found")
    return {
        "id": membership.id,
        "name": membership.name,
        "description": membership.description,
        "price_monthly": membership.price_monthly,
        "price_quarterly": membership.price_quarterly,
        "price_yearly": membership.price_yearly,
        "features": membership.features,
        "sort_order": membership.sort_order,
        "status": membership.status,
        "created_at": membership.created_at,
    }


@router.put("/{membership_id}")
async def update_membership(
    membership_id: str,
    req: MembershipUpdate,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    membership = await session.get(Membership, membership_id)
    if not membership:
        raise HTTPException(404, "Membership not found")
    update_data = req.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(membership, key, value)
    session.add(membership)
    await session.commit()
    await session.refresh(membership)

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="update_membership", target_type="membership", target_id=membership_id,
    )

    return {
        "id": membership.id,
        "name": membership.name,
        "description": membership.description,
        "price_monthly": membership.price_monthly,
        "price_quarterly": membership.price_quarterly,
        "price_yearly": membership.price_yearly,
        "features": membership.features,
        "sort_order": membership.sort_order,
        "status": membership.status,
        "created_at": membership.created_at,
    }


@router.delete("/{membership_id}")
async def delete_membership(
    membership_id: str,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    membership = await session.get(Membership, membership_id)
    if not membership:
        raise HTTPException(404, "Membership not found")
    await session.delete(membership)
    await session.commit()

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="delete_membership", target_type="membership", target_id=membership_id,
    )

    return {"message": "Membership deleted"}
