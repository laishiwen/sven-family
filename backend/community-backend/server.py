#!/usr/bin/env python3
"""
Community Backend Server
========================
FastAPI HTTP server with APP_MODE routing:
- public : /api/*  (community frontend, :50051)
- admin  : /admin/* (admin-backend / crawler, :50052)
- both   : all routes (local dev)

Uses PostgreSQL via SQLAlchemy async (database.py).
"""

import os
from contextlib import asynccontextmanager
from typing import Optional

import bcrypt
from fastapi import FastAPI, HTTPException, Query, APIRouter, Depends
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from auth import create_access_token, get_current_user, get_optional_user
from database import (
    init_db, utc_now, gen_id, get_engine,
    get_all_sections, get_section, create_section, update_section, delete_section,
    get_user, get_user_by_email, get_user_by_username, create_user, update_user, list_users,
    compute_user_level,
    get_topic, get_topic_comments, get_comment_replies, create_topic, update_topic, list_topics,
    create_comment, get_comment, delete_comment,
    toggle_reaction, get_reactions, get_user_reactions,
    toggle_like, get_all_tags, get_stats,
    log_admin_action, list_admin_logs,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.app_mode in ("public", "admin", "both"):
        await init_db()
    yield
    eng = get_engine()
    if eng:
        await eng.dispose()


app = FastAPI(
    title=settings.app_name,
    version="2.0",
    description="Community API with PostgreSQL, sections, nested comments, and reactions.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ──────────────────────────────────────────────────────────────────

public = APIRouter()
admin = APIRouter()

# ── Helper ────────────────────────────────────────────────────────────────────

def extract_audit(body: dict) -> tuple[str, str, str]:
    audit = body.get("audit", {})
    return audit.get("admin_id", "system"), audit.get("admin_name", "System"), audit.get("reason", "")

def enrich_user(u: dict) -> dict:
    u["level"] = compute_user_level(u)
    return u


def _resolve_user_id(payload: dict | None, body: dict, key: str = "author_id") -> str:
    """Extract user_id from JWT; fallback to body param for backward compat."""
    if payload:
        return payload["sub"]
    user_id = body.get(key)
    if not user_id:
        raise HTTPException(status_code=400, detail=f"{key} is required")
    return user_id


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS  (/api/*)
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/health")
async def health():
    return {"status": "ok", "version": "2.0"}

# ── Sections ──────────────────────────────────────────────────────────────────

@public.get("/sections")
async def api_sections():
    return await get_all_sections()

@public.get("/sections/{slug}")
async def api_section(slug: str):
    section = await get_section(slug)
    if not section:
        raise HTTPException(status_code=404, detail="Section not found")
    return section

# ── Users (internal lookups) ──────────────────────────────────────────────────

@public.get("/users/by-email")
async def api_get_user_by_email(email: str = Query("")):
    if not email:
        raise HTTPException(status_code=400, detail="email query parameter required")
    user = await get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

# ── Topics ────────────────────────────────────────────────────────────────────

@public.get("/topics")
async def api_list_topics(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""), tag: str = Query(""), section: str = Query(""),
    sort_by: str = Query("created_at"), sort_desc: bool = Query(True),
    status: str = Query("published"),
):
    return await list_topics(
        page=page, page_size=page_size, search=search,
        tag=tag, section_slug=section, sort_by=sort_by,
        sort_desc=sort_desc, status=status,
    )

@public.get("/topics/{topic_id}")
async def api_get_topic(topic_id: str):
    topic = await get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    comments = await get_topic_comments(topic_id)
    enriched = []
    for c in comments:
        c["replies"] = await get_comment_replies(c["id"]) if not c.get("parent_id") else []
        c["reactions"] = await get_reactions("comment", c["id"])
        enriched.append(c)
    top_level = [c for c in enriched if not c.get("parent_id")]
    return {**topic, "comments": top_level, "reactions": await get_reactions("post", topic_id)}

@public.post("/topics")
async def api_create_topic(body: dict, current_user: dict = Depends(get_current_user)):
    if not body.get("title") or not body.get("content"):
        raise HTTPException(status_code=400, detail="Title and content are required")
    author_id = _resolve_user_id(current_user, body, "author_id")
    topic = await create_topic({
        "section_id": body.get("section_id", "sec-engineering"),
        "title": body["title"], "content": body["content"],
        "author_id": author_id, "tags": body.get("tags", []),
        "status": "published", "source": "user",
    })
    return topic

@public.put("/topics/{topic_id}")
async def api_update_topic(topic_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    topic = await get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    author_id = _resolve_user_id(current_user, body, "author_id")
    if topic["author_id"] != author_id and current_user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Only the author can edit this post")
    updates = {}
    for field in ("title", "content", "section_id", "tags"):
        if field in body:
            updates[field] = body[field]
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await update_topic(topic_id, updates)
    return await get_topic(topic_id)

@public.delete("/topics/{topic_id}")
async def api_delete_topic(topic_id: str, current_user: dict = Depends(get_current_user)):
    topic = await get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    if topic["author_id"] != current_user["sub"] and current_user.get("role") not in ("admin", "moderator"):
        raise HTTPException(status_code=403, detail="Not authorized")
    await update_topic(topic_id, {"status": "deleted"})
    return {"detail": "Topic deleted"}

# ── Comments ──────────────────────────────────────────────────────────────────

@public.get("/topics/{topic_id}/comments")
async def api_list_comments(topic_id: str):
    comments = await get_topic_comments(topic_id)
    enriched = []
    for c in comments:
        c["replies"] = await get_comment_replies(c["id"]) if not c.get("parent_id") else []
        c["reactions"] = await get_reactions("comment", c["id"])
        enriched.append(c)
    return [c for c in enriched if not c.get("parent_id")]

@public.post("/topics/{topic_id}/comments")
async def api_create_comment(topic_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    if not body.get("content"):
        raise HTTPException(status_code=400, detail="content is required")
    topic = await get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")
    author_id = _resolve_user_id(current_user, body, "author_id")
    comment = await create_comment({
        "topic_id": topic_id, "author_id": author_id,
        "content": body["content"], "parent_id": body.get("parent_id"),
    })
    return await get_comment(comment["id"])

@public.get("/comments/{comment_id}/replies")
async def api_comment_replies(comment_id: str):
    return await get_comment_replies(comment_id)

# ── Likes ─────────────────────────────────────────────────────────────────────

@public.post("/topics/{topic_id}/like")
async def api_toggle_like(topic_id: str, body: dict, current_user: dict = Depends(get_current_user)):
    user_id = _resolve_user_id(current_user, body, "user_id")
    return await toggle_like(user_id, topic_id)

# ── Reactions ─────────────────────────────────────────────────────────────────

@public.post("/reactions")
async def api_toggle_reaction(body: dict, current_user: dict = Depends(get_current_user)):
    required = ("target_type", "target_id", "emoji")
    if not all(k in body for k in required):
        raise HTTPException(status_code=400, detail=f"Required: {', '.join(required)}")
    if body["target_type"] not in ("post", "comment"):
        raise HTTPException(status_code=400, detail="target_type must be 'post' or 'comment'")
    user_id = _resolve_user_id(current_user, body, "user_id")
    return await toggle_reaction(user_id, body["target_type"], body["target_id"], body["emoji"])

@public.get("/reactions/{target_type}/{target_id}")
async def api_get_reactions(target_type: str, target_id: str, user_id: str = Query(""), current_user: dict | None = Depends(get_optional_user)):
    result = {"reactions": await get_reactions(target_type, target_id)}
    uid = current_user["sub"] if current_user else user_id
    if uid:
        result["my_reactions"] = await get_user_reactions(uid, target_type, target_id)
    return result

# ── Tags ──────────────────────────────────────────────────────────────────────

@public.get("/tags")
async def api_tags():
    return await get_all_tags()

# ── Search ────────────────────────────────────────────────────────────────────

@public.get("/search")
async def api_search(q: str = Query(""), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    if not q:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}
    return await list_topics(page=page, page_size=page_size, search=q, status="")

# ── Auth ──────────────────────────────────────────────────────────────────────

@public.post("/auth/register")
async def api_register(body: dict):
    for f in ("username", "email", "password"):
        if not body.get(f):
            raise HTTPException(status_code=400, detail=f"{f} is required")
    if await get_user_by_email(body["email"]):
        raise HTTPException(status_code=409, detail="Email already registered")
    if await get_user_by_username(body["username"]):
        raise HTTPException(status_code=409, detail="Username already taken")
    password_hash = bcrypt.hashpw(body["password"].encode(), bcrypt.gensalt(12)).decode()
    user = await create_user({
        "username": body["username"],
        "email": body["email"],
        "password_hash": password_hash,
        "avatar_url": body.get("avatar_url", ""),
    })
    token = create_access_token(user)
    return {"access_token": token, "user": {k: user[k] for k in ("id", "username", "email", "role", "avatar_url")}}

@public.post("/auth/login")
async def api_login(body: dict):
    if not body.get("email") or not body.get("password"):
        raise HTTPException(status_code=400, detail="Email and password are required")
    user = await get_user_by_email(body["email"])
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user["status"] == "banned":
        raise HTTPException(status_code=403, detail="Account is banned")
    if not bcrypt.checkpw(body["password"].encode(), user["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token(user)
    return {"access_token": token, "user": {k: user[k] for k in ("id", "username", "email", "role", "avatar_url")}}


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS  (/admin/*)
# ═══════════════════════════════════════════════════════════════════════════════

@admin.get("/users")
async def admin_list_users(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""), status: str = Query(""),
    sort_by: str = Query("created_at"), sort_desc: bool = Query(True),
):
    result = await list_users(page=page, page_size=page_size, search=search,
                              status=status, sort_by=sort_by, sort_desc=sort_desc)
    result["items"] = [enrich_user(u) for u in result["items"]]
    return result

@admin.get("/users/{user_id}")
async def admin_get_user(user_id: str):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return enrich_user(user)

@admin.post("/users")
async def admin_create_user(body: dict):
    for f in ("username", "email", "password_hash"):
        if not body.get(f):
            raise HTTPException(status_code=400, detail=f"{f} is required")
    if await get_user_by_email(body["email"]):
        raise HTTPException(status_code=409, detail="Email already registered")
    if await get_user_by_username(body["username"]):
        raise HTTPException(status_code=409, detail="Username already taken")
    admin_id, admin_name, reason = extract_audit(body)
    body["password_hash"] = bcrypt.hashpw(
        body["password_hash"].encode(), bcrypt.gensalt(12)
    ).decode()
    user = await create_user(body)
    await log_admin_action(admin_id, admin_name, "create_user", "user", user["id"], reason)
    return enrich_user(user)

@admin.put("/users/{user_id}")
async def admin_update_user(user_id: str, body: dict):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    admin_id, admin_name, reason = extract_audit(body)
    updates = {}
    if "username" in body: updates["username"] = body["username"]
    if "role" in body:
        if body["role"] not in ("user", "admin", "moderator"):
            raise HTTPException(status_code=400, detail="Invalid role")
        updates["role"] = body["role"]
    if "status" in body:
        if body["status"] not in ("active", "banned", "inactive"):
            raise HTTPException(status_code=400, detail="Invalid status")
        updates["status"] = body["status"]
    if "bio" in body: updates["bio"] = body["bio"]
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await update_user(user_id, updates)
    await log_admin_action(admin_id, admin_name, "update_user", "user", user_id, reason,
                           {"updates": list(updates.keys())})
    return enrich_user(await get_user(user_id))

@admin.delete("/users/{user_id}")
async def admin_delete_user(user_id: str, body: dict = {}):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.get("role") == "admin":
        raise HTTPException(status_code=403, detail="Cannot delete admin users")
    admin_id, admin_name, reason = extract_audit(body)
    await update_user(user_id, {
        "status": "deleted",
        "email": f"deleted_{user_id}_{user['email']}",
        "username": f"deleted_{user_id}_{user['username']}",
    })
    await log_admin_action(admin_id, admin_name, "delete_user", "user", user_id, reason)
    return {"detail": "User deleted", "user_id": user_id}

@admin.post("/users/{user_id}/ban")
async def admin_ban_user(user_id: str, body: dict):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    admin_id, admin_name, reason = extract_audit(body)
    duration_hours = body.get("duration_hours", 0)
    reason_text = body.get("reason", reason)
    ban_expires = None
    if duration_hours and duration_hours > 0:
        from datetime import datetime, timedelta, timezone as tz
        ban_expires = (datetime.now(tz.utc) + timedelta(hours=duration_hours)).isoformat()
    await update_user(user_id, {"status": "banned", "ban_expires_at": ban_expires})
    await log_admin_action(admin_id, admin_name, "ban_user", "user", user_id, reason_text,
                           {"duration_hours": duration_hours})
    return await get_user(user_id)

@admin.post("/users/{user_id}/unban")
async def admin_unban_user(user_id: str, body: dict):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    admin_id, admin_name, reason = extract_audit(body)
    await update_user(user_id, {"status": "active", "ban_expires_at": None})
    await log_admin_action(admin_id, admin_name, "unban_user", "user", user_id, reason)
    return await get_user(user_id)

@admin.post("/users/{user_id}/censor")
async def admin_censor_user(user_id: str, body: dict):
    user = await get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    admin_id, admin_name, reason = extract_audit(body)
    updates, detail = {}, {}
    if body.get("censor_username"):
        updates["username"] = "***"
        updates["username_censored"] = True
        detail["username_censored"] = True
    if body.get("censor_avatar"):
        updates["avatar_url"] = ""
        updates["avatar_censored"] = True
        detail["avatar_censored"] = True
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to censor")
    await update_user(user_id, updates)
    await log_admin_action(admin_id, admin_name, "censor_user", "user", user_id, reason, detail)
    return await get_user(user_id)

# ── Sections (Admin) ─────────────────────────────────────────────────────────

@admin.get("/sections")
async def admin_list_sections():
    return await get_all_sections()

@admin.post("/sections")
async def admin_create_section(body: dict):
    if not body.get("name") or not body.get("slug"):
        raise HTTPException(status_code=400, detail="name and slug are required")
    existing = await get_section(body["slug"])
    if existing:
        raise HTTPException(status_code=409, detail="Section slug already exists")
    return await create_section(body)

@admin.put("/sections/{section_id}")
async def admin_update_section(section_id: str, body: dict):
    result = await update_section(section_id, body)
    if not result:
        raise HTTPException(status_code=404, detail="Section not found")
    return result

@admin.delete("/sections/{section_id}")
async def admin_delete_section(section_id: str):
    ok = await delete_section(section_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Section not found")
    return {"ok": True}

# ── Posts ────────────────────────────────────────────────────────────────────

@admin.get("/posts")
async def admin_list_posts(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    search: str = Query(""), status: str = Query(""), tag: str = Query(""),
    author_id: str = Query(""), source: str = Query(""), section: str = Query(""),
    sort_by: str = Query("created_at"), sort_desc: bool = Query(True),
):
    return await list_topics(page=page, page_size=page_size, search=search, status=status or "",
                             tag=tag, author_id=author_id, source=source or "",
                             section_slug=section, sort_by=sort_by, sort_desc=sort_desc)

@admin.get("/posts/{post_id}")
async def admin_get_post(post_id: str):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    comments = await get_topic_comments(post_id)
    enriched = []
    for c in comments:
        c["replies"] = await get_comment_replies(c["id"]) if not c.get("parent_id") else []
        enriched.append(c)
    return {**topic, "comments": enriched}

@admin.put("/posts/{post_id}")
async def admin_update_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    updates = {}
    for field in ("title", "content", "section_id", "tags", "status"):
        if field in body:
            updates[field] = body[field]
    if "section_id" in updates:
        sid = updates["section_id"]
        if sid and not sid.startswith("sec-"):
            sec = await get_section(sid)
            if sec: updates["section_id"] = sec["id"]
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    await update_topic(post_id, updates)
    await log_admin_action(admin_id, admin_name, "update_post", "post", post_id, reason,
                           {"updates": list(updates.keys())})
    return await get_topic(post_id)

@admin.post("/posts")
async def admin_create_post(body: dict):
    if not body.get("title") or not body.get("content"):
        raise HTTPException(status_code=400, detail="title and content are required")
    admin_id, admin_name, reason = extract_audit(body)
    author_id = body.get("author_id", admin_id)
    if not await get_user(author_id):
        await create_user({
            "id": author_id, "username": admin_name,
            "email": f"{author_id}@admin.internal",
            "password_hash": "$admin$", "role": "admin", "status": "active",
        })
    section_id = body.get("section_id", "sec-engineering")
    if section_id and not section_id.startswith("sec-"):
        sec = await get_section(section_id)
        if sec: section_id = sec["id"]
    topic = await create_topic({
        "section_id": section_id, "title": body["title"], "content": body["content"],
        "author_id": author_id, "tags": body.get("tags", []),
        "status": "published", "source": "admin",
    })
    await log_admin_action(admin_id, admin_name, "create_post", "post", topic["id"], reason)
    return topic

@admin.delete("/posts/{post_id}")
async def admin_delete_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    await update_topic(post_id, {"status": "deleted"})
    await log_admin_action(admin_id, admin_name, "delete_post", "post", post_id, reason)
    return {"detail": "Post deleted", "post_id": post_id}

@admin.post("/posts/batch-delete")
async def admin_batch_delete_posts(body: dict):
    post_ids = body.get("post_ids", [])
    if not post_ids:
        raise HTTPException(status_code=400, detail="post_ids required")
    admin_id, admin_name, reason = extract_audit(body)
    deleted = []
    for pid in post_ids:
        if await update_topic(pid, {"status": "deleted"}):
            await log_admin_action(admin_id, admin_name, "batch_delete_post", "post", pid, reason)
            deleted.append(pid)
    return {"deleted_count": len(deleted), "deleted_ids": deleted}

@admin.post("/posts/{post_id}/hide")
async def admin_hide_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    await update_topic(post_id, {"status": "hidden"})
    await log_admin_action(admin_id, admin_name, "hide_post", "post", post_id, reason)
    return {"detail": "Post hidden", "post_id": post_id}

@admin.post("/posts/{post_id}/restore")
async def admin_restore_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    await update_topic(post_id, {"status": "published"})
    await log_admin_action(admin_id, admin_name, "restore_post", "post", post_id, reason)
    return {"detail": "Post restored", "post_id": post_id}

@admin.post("/posts/{post_id}/review")
async def admin_review_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    review_action = body.get("action")
    if review_action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    new_status = "published" if review_action == "approve" else "rejected"
    await update_topic(post_id, {"status": new_status})
    await log_admin_action(admin_id, admin_name, f"review_post_{review_action}", "post", post_id, reason)
    return await get_topic(post_id)

@admin.post("/posts/{post_id}/censor")
async def admin_censor_post(post_id: str, body: dict):
    topic = await get_topic(post_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Post not found")
    admin_id, admin_name, reason = extract_audit(body)
    fields_to_censor = body.get("fields", {})
    patterns = body.get("patterns", [])
    updates, detail = {}, {}
    if fields_to_censor.get("title") and topic.get("title"):
        censored = topic["title"]
        for p in patterns: censored = censored.replace(p, "***")
        updates["title"], detail["title_censored"] = censored, True
    if fields_to_censor.get("content") and topic.get("content"):
        censored = topic["content"]
        for p in patterns: censored = censored.replace(p, "***")
        updates["content"], detail["content_censored"] = censored, True
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to censor")
    await update_topic(post_id, updates)
    await log_admin_action(admin_id, admin_name, "censor_post", "post", post_id, reason, detail)
    return await get_topic(post_id)

# ── Comments (Admin) ─────────────────────────────────────────────────────────

@admin.delete("/comments/{comment_id}")
async def admin_delete_comment(comment_id: str, body: dict):
    comment = await get_comment(comment_id)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    admin_id, admin_name, reason = extract_audit(body)
    await delete_comment(comment_id)
    await log_admin_action(admin_id, admin_name, "delete_comment", "comment", comment_id, reason)
    return {"detail": "Comment deleted", "comment_id": comment_id}

# ── Crawler ──────────────────────────────────────────────────────────────────

@admin.post("/crawler/posts")
async def admin_create_crawler_post(body: dict):
    title = body.get("title")
    content = body.get("content")
    if not title or not content:
        raise HTTPException(status_code=400, detail="title and content are required")
    section_id = body.get("section_id", "sec-engineering")
    auto_publish = body.get("auto_publish", False)
    author_id = body.get("author_id", "crawler")
    if not await get_user(author_id):
        await create_user({
            "id": author_id, "username": body.get("source_name", "Crawler Bot"),
            "email": f"crawler@{author_id}.internal",
            "password_hash": "$crawler$", "role": "admin", "status": "active",
        })
    topic = await create_topic({
        "section_id": section_id, "title": title, "content": content,
        "author_id": author_id, "tags": body.get("tags", []),
        "status": "published" if auto_publish else "pending_review",
        "source": "crawler", "source_url": body.get("source_url", ""),
        "source_name": body.get("source_name", ""),
    })
    await log_admin_action("crawler", "Crawler Bot", "create_crawler_post", "post", topic["id"],
                           "", {"source_url": body.get("source_url"), "auto_publish": auto_publish})
    return topic

# ── Stats ────────────────────────────────────────────────────────────────────

@admin.get("/stats")
async def admin_stats():
    return await get_stats()

# ── Audit Logs ───────────────────────────────────────────────────────────────

@admin.get("/audit-logs")
async def admin_audit_logs(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    admin_id: str = Query(""), action: str = Query(""),
):
    return await list_admin_logs(page=page, page_size=page_size, admin_id=admin_id, action=action)


# ═══════════════════════════════════════════════════════════════════════════════
# Mount routers by APP_MODE
# ═══════════════════════════════════════════════════════════════════════════════

mode = settings.app_mode

if mode in ("public", "both"):
    app.include_router(public, prefix="/api")

if mode in ("admin", "both"):
    app.include_router(admin, prefix="/admin")
