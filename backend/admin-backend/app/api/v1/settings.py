import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import select, SQLModel, Field
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import Column, String, JSON
from typing import Any, Dict, Optional

from app.core.database import get_session, init_db
from app.models.admin import gen_uuid
from app.middleware.auth import get_current_admin
from app.middleware.audit import log_admin_action

router = APIRouter()


class Setting(SQLModel, table=True):
    __tablename__ = "admin_settings"
    key: str = Field(sa_column=Column(String(100), primary_key=True))
    value: Optional[Any] = Field(default="", sa_column=Column(JSON))
    description: Optional[str] = None
    updated_at: Optional[str] = None


class SettingUpdate(BaseModel):
    value: Any
    description: Optional[str] = None


class BulkSettingUpdate(BaseModel):
    settings: Dict[str, Any]


@router.get("/")
async def get_all_settings(
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    result = await session.exec(select(Setting))
    settings = result.all()
    return {
        key: {
            "value": s.value,
            "description": s.description,
            "updated_at": s.updated_at,
        }
        for s in settings
    }


@router.get("/{key}")
async def get_setting(
    key: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    setting = await session.get(Setting, key)
    if not setting:
        raise HTTPException(404, f"Setting '{key}' not found")
    return {
        "key": setting.key,
        "value": setting.value,
        "description": setting.description,
        "updated_at": setting.updated_at,
    }


@router.put("/{key}")
async def update_setting(
    key: str,
    req: SettingUpdate,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    from datetime import datetime, timezone

    setting = await session.get(Setting, key)
    if not setting:
        setting = Setting(
            key=key,
            value=req.value,
            description=req.description,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
    else:
        setting.value = req.value
        if req.description is not None:
            setting.description = req.description
        setting.updated_at = datetime.now(timezone.utc).isoformat()

    session.add(setting)
    await session.commit()
    await session.refresh(setting)

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="update_setting", target_type="setting", target_id=key,
    )

    return {
        "key": setting.key,
        "value": setting.value,
        "description": setting.description,
        "updated_at": setting.updated_at,
    }


@router.put("/")
async def bulk_update_settings(
    req: BulkSettingUpdate,
    session: AsyncSession = Depends(get_session),
    admin=Depends(get_current_admin),
):
    """Bulk update multiple settings at once (used by admin-frontend Settings page)."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    results = {}
    for key, value in req.settings.items():
        setting = await session.get(Setting, key)
        if setting:
            setting.value = value
            setting.updated_at = now
        else:
            setting = Setting(key=key, value=value, updated_at=now)
        session.add(setting)
        results[key] = value
    await session.commit()

    await log_admin_action(
        admin_id=admin.id, admin_name=admin.username,
        action="bulk_update_settings", target_type="setting",
        target_id=",".join(req.settings.keys()),
    )

    return {"message": "Settings updated", "settings": results}


@router.delete("/{key}")
async def delete_setting(
    key: str,
    session: AsyncSession = Depends(get_session),
    _=Depends(get_current_admin),
):
    setting = await session.get(Setting, key)
    if not setting:
        raise HTTPException(404, f"Setting '{key}' not found")
    await session.delete(setting)
    await session.commit()
    return {"message": f"Setting '{key}' deleted"}
