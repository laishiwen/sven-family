"""Community management endpoints — proxy to community gRPC bridge via HTTP."""
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.middleware.auth import get_current_admin, AdminUser
from app.core.config import settings

router = APIRouter()

BRIDGE_URL = settings.community_bridge_url


async def bridge(method: str, path: str, **kwargs) -> dict:
    """Call community bridge via HTTP. All endpoints return JSON."""
    url = f"{BRIDGE_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.request(method, url, **kwargs)
            if resp.status_code >= 400:
                detail = resp.text[:200]
                raise HTTPException(resp.status_code, detail)
            if resp.status_code == 204:
                return {}
            return resp.json()
    except httpx.ConnectError:
        raise HTTPException(503, "Community bridge unreachable")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, f"Bridge error: {str(e)}")


def audit_body(admin: AdminUser) -> dict:
    return {"admin_id": admin.id, "admin_name": admin.username, "reason": ""}


# ── Schemas ───────────────────────────────────────────────────────────

class AuditRequest(BaseModel):
    reason: str = ""

class BanRequest(AuditRequest):
    duration_hours: int = 0

class BatchDeleteRequest(BaseModel):
    post_ids: list[str]
    reason: str = ""

class CensorPostRequest(BaseModel):
    field_masks: list[str] = []
    replacement: Optional[str] = None

class CensorUserRequest(BaseModel):
    censor_username: bool = False
    censor_avatar: bool = False

class ReviewPostRequest(BaseModel):
    decision: str
    reject_reason: Optional[str] = None

class HideRestoreRequest(AuditRequest):
    pass

class DeletePostRequest(AuditRequest):
    notify_author: bool = True


# ── Users ─────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    sort_by: str = "created_at",
    sort_desc: bool = True,
    _=Depends(get_current_admin),
):
    params = {"page": page, "page_size": page_size, "sort_by": sort_by, "sort_desc": str(sort_desc).lower()}
    if search: params["search"] = search
    if status: params["status"] = status
    return await bridge("GET", "/admin/users", params=params)


@router.get("/users/{user_id}")
async def get_user(user_id: str, _=Depends(get_current_admin)):
    return await bridge("GET", f"/admin/users/{user_id}")


@router.post("/users")
async def create_user(body: dict, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", "/admin/users", json={**body, "audit": audit_body(admin)})


@router.put("/users/{user_id}")
async def update_user(user_id: str, body: dict, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("PUT", f"/admin/users/{user_id}", json={**body, "audit": audit_body(admin)})


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("DELETE", f"/admin/users/{user_id}", json=audit_body(admin))


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: str, body: BanRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/users/{user_id}/ban", json={
        **audit_body(admin), "duration_hours": body.duration_hours,
        "reason": body.reason,
    })


@router.post("/users/{user_id}/unban")
async def unban_user(user_id: str, body: AuditRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/users/{user_id}/unban", json={
        **audit_body(admin), "reason": body.reason,
    })


@router.post("/users/{user_id}/censor")
async def censor_user(user_id: str, body: CensorUserRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/users/{user_id}/censor", json={
        **audit_body(admin), **body.model_dump(),
    })


# ── Sections ────────────────────────────────────────────────────────────

@router.get("/sections")
async def list_sections(_=Depends(get_current_admin)):
    return await bridge("GET", "/admin/sections")


@router.post("/sections")
async def create_section(body: dict, _=Depends(get_current_admin)):
    return await bridge("POST", "/admin/sections", json=body)


@router.put("/sections/{section_id}")
async def update_section(section_id: str, body: dict, _=Depends(get_current_admin)):
    return await bridge("PUT", f"/admin/sections/{section_id}", json=body)


@router.delete("/sections/{section_id}")
async def delete_section(section_id: str, _=Depends(get_current_admin)):
    return await bridge("DELETE", f"/admin/sections/{section_id}")


# ── Posts ─────────────────────────────────────────────────────────────

@router.get("/posts")
async def list_posts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    tag: Optional[str] = None,
    author_id: Optional[str] = None,
    source: Optional[str] = None,
    section: Optional[str] = None,
    _=Depends(get_current_admin),
):
    params = {"page": page, "page_size": page_size}
    if search: params["search"] = search
    if status: params["status"] = status
    if tag: params["tag"] = tag
    if author_id: params["author_id"] = author_id
    if source: params["source"] = source
    if section: params["section"] = section
    return await bridge("GET", "/admin/posts", params=params)


@router.post("/posts")
async def admin_create_post(body: dict, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", "/admin/posts", json={
        **body, "audit": audit_body(admin),
    })


@router.get("/posts/{post_id}")
async def get_post(post_id: str, _=Depends(get_current_admin)):
    return await bridge("GET", f"/admin/posts/{post_id}")


@router.put("/posts/{post_id}")
async def update_post(post_id: str, body: dict, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("PUT", f"/admin/posts/{post_id}", json={
        **body, "audit": audit_body(admin),
    })


@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, body: dict = {}, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("DELETE", f"/admin/posts/{post_id}", json={
        **audit_body(admin),
        "notify_author": body.get("notify_author", False),
        "reason_text": body.get("reason", ""),
    })


@router.post("/posts/batch-delete")
async def batch_delete_posts(body: BatchDeleteRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", "/admin/posts/batch-delete", json={
        "post_ids": body.post_ids, **audit_body(admin), "reason": body.reason,
    })


@router.post("/posts/{post_id}/hide")
async def hide_post(post_id: str, body: AuditRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/posts/{post_id}/hide", json={
        **audit_body(admin), "reason": body.reason,
    })


@router.post("/posts/{post_id}/restore")
async def restore_post(post_id: str, body: AuditRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/posts/{post_id}/restore", json={
        **audit_body(admin), "reason": body.reason,
    })


@router.post("/posts/{post_id}/censor")
async def censor_post(post_id: str, body: CensorPostRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/posts/{post_id}/censor", json={
        **audit_body(admin), **body.model_dump(),
    })


@router.post("/posts/{post_id}/review")
async def review_post(post_id: str, body: ReviewPostRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("POST", f"/admin/posts/{post_id}/review", json={
        **audit_body(admin), **body.model_dump(),
    })


# ── Comments ──────────────────────────────────────────────────────────

@router.delete("/comments/{comment_id}")
async def delete_comment(comment_id: str, body: AuditRequest, admin: AdminUser = Depends(get_current_admin)):
    return await bridge("DELETE", f"/admin/comments/{comment_id}", json={
        **audit_body(admin), "reason": body.reason,
    })


# ── Stats & Audit ─────────────────────────────────────────────────────

@router.get("/stats")
async def community_stats(_=Depends(get_current_admin)):
    return await bridge("GET", "/admin/stats")


@router.get("/audit-logs")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_id: Optional[str] = None,
    action: Optional[str] = None,
    _=Depends(get_current_admin),
):
    params = {"page": page, "page_size": page_size}
    if admin_id: params["admin_id"] = admin_id
    if action: params["action"] = action
    return await bridge("GET", "/admin/audit-logs", params=params)
