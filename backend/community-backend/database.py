"""
Database layer for Community Backend Server.
PostgreSQL only.
Uses SQLAlchemy 2.0 async ORM.
"""

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional, List

from sqlalchemy import (
    Column, String, Integer, Boolean, Text, ForeignKey, UniqueConstraint,
    JSON, DateTime, select, func, update as sa_update, delete as sa_delete,
    or_, text,
)
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, relationship, joinedload

from config import settings

logger = logging.getLogger(__name__)

# ── Database config ──────────────────────────────────────────────────────────
DB_URL = settings.database_url
_engine = None
_AsyncSessionLocal = None


def _create_engine(url: str):
    return create_async_engine(url, echo=False, pool_size=5, max_overflow=10)


def get_engine():
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _engine


def get_session():
    if _AsyncSessionLocal is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _AsyncSessionLocal()


# ── ORM Base ──────────────────────────────────────────────────────────────────

class Base(DeclarativeBase):
    pass


# ── Models ────────────────────────────────────────────────────────────────────

class Section(Base):
    __tablename__ = "sections"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False, unique=True)
    description = Column(String, default="")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True)
    username = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")
    status = Column(String, default="active")
    avatar_url = Column(String, default="")
    bio = Column(String, default="")
    location = Column(String, default="")
    ban_expires_at = Column(DateTime(timezone=True), nullable=True)
    avatar_censored = Column(Boolean, default=False)
    username_censored = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class Topic(Base):
    __tablename__ = "topics"
    id = Column(String, primary_key=True)
    section_id = Column(String, ForeignKey("sections.id"), default="sec-engineering")
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    tags = Column(JSON, default=list)
    status = Column(String, default="published")
    source = Column(String, default="user")
    source_url = Column(String, nullable=True)
    source_name = Column(String, nullable=True)
    likes_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    last_reply_user_id = Column(String, nullable=True)
    last_reply_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    author = relationship("User", foreign_keys=[author_id], lazy="joined")
    section = relationship("Section", lazy="joined")


class Comment(Base):
    __tablename__ = "comments"
    id = Column(String, primary_key=True)
    topic_id = Column(String, ForeignKey("topics.id"), nullable=False)
    author_id = Column(String, ForeignKey("users.id"), nullable=False)
    parent_id = Column(String, ForeignKey("comments.id"), nullable=True)
    content = Column(Text, nullable=False)
    status = Column(String, default="published")
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    author = relationship("User", lazy="joined")


class Reaction(Base):
    __tablename__ = "reactions"
    __table_args__ = (UniqueConstraint("user_id", "target_type", "target_id", "emoji"),)
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    emoji = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class AdminLog(Base):
    __tablename__ = "admin_logs"
    id = Column(String, primary_key=True)
    admin_id = Column(String, nullable=False)
    admin_name = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=True)
    target_id = Column(String, nullable=True)
    reason = Column(String, default="")
    detail = Column(JSON, default=dict)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# ── Default sections ─────────────────────────────────────────────────────────

DEFAULT_SECTIONS = [
    {"id": "sec-ai", "name": "AI", "slug": "ai", "description": "人工智能、大模型、机器学习相关讨论", "sort_order": 1},
    {"id": "sec-tech", "name": "科技", "slug": "tech", "description": "科技行业动态与前沿技术", "sort_order": 2},
    {"id": "sec-finance", "name": "财经", "slug": "finance", "description": "财经资讯与投资讨论", "sort_order": 3},
    {"id": "sec-engineering", "name": "技术", "slug": "engineering", "description": "软件开发、架构、工程实践", "sort_order": 4},
    {"id": "sec-idea", "name": "idea", "slug": "idea", "description": "创意、想法、灵感分享", "sort_order": 5},
    {"id": "sec-work", "name": "work", "slug": "work", "description": "职场经验、远程工作、效率工具", "sort_order": 6},
    {"id": "sec-blockchain", "name": "区块链", "slug": "blockchain", "description": "Web3、加密货币、去中心化技术", "sort_order": 7},
]


# ── Init ──────────────────────────────────────────────────────────────────────

async def _ensure_database_exists(db_url: str) -> None:
    """Create the target database if it does not already exist."""
    parsed = make_url(db_url)
    target_db = parsed.database or ""
    default_url = parsed.set(database="postgres").render_as_string(hide_password=False)
    engine = create_async_engine(default_url, isolation_level="AUTOCOMMIT")
    try:
        async with engine.connect() as conn:
            row = await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :db"), {"db": target_db}
            )
            if row.fetchone() is None:
                await conn.execute(text(f'CREATE DATABASE "{target_db}"'))
                logger.info("Created database: %s", target_db)
    finally:
        await engine.dispose()


async def init_db():
    global _engine, _AsyncSessionLocal

    await _ensure_database_exists(DB_URL)

    _engine = _create_engine(DB_URL)
    _AsyncSessionLocal = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)

    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with _AsyncSessionLocal() as session:
        result = await session.execute(select(func.count(Section.id)))
        if result.scalar() == 0:
            now = datetime.now(timezone.utc)
            for s in DEFAULT_SECTIONS:
                session.add(Section(id=s["id"], name=s["name"], slug=s["slug"],
                                    description=s["description"], sort_order=s["sort_order"],
                                    created_at=now))
            await session.commit()

    logger.info("Database ready (PostgreSQL)")


# ── User Level System ───────────────────────────────────────────────────────

def compute_user_level(user: dict) -> dict:
    """Compute user level based on activity metrics.

    Activity Score = post_count * 3 + comment_count * 1 + days_since_registration / 30

    Levels:
      L1 新手上路: score 0-30
      L2 初级会员: score 31-100
      L3 中级会员: score 101-300
      L4 高级会员: score 301-800
      L5 资深会员: score 801-2000
      L6 元老会员: score 2001+
      L7 版主:     role == 'moderator'
      L8 管理员:    role == 'admin'
    """
    role = user.get("role", "user")
    if role == "admin":
        return {"level": 8, "name": "管理员", "color": "#7C3AED"}
    if role == "moderator":
        return {"level": 7, "name": "版主", "color": "#2563EB"}

    post_count = user.get("post_count", 0) or 0
    comment_count = user.get("comment_count", 0) or 0
    created_at = user.get("created_at")
    days_active = 0
    if created_at:
        try:
            from datetime import datetime, timezone
            if isinstance(created_at, str):
                created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
            days_active = (datetime.now(timezone.utc) - created_at.replace(tzinfo=timezone.utc)).days
        except Exception:
            pass

    score = post_count * 3 + comment_count * 1 + days_active / 30

    if score <= 30:
        return {"level": 1, "name": "新手上路", "color": "#9CA3AF"}
    elif score <= 100:
        return {"level": 2, "name": "初级会员", "color": "#22C55E"}
    elif score <= 300:
        return {"level": 3, "name": "中级会员", "color": "#3B82F6"}
    elif score <= 800:
        return {"level": 4, "name": "高级会员", "color": "#F59E0B"}
    elif score <= 2000:
        return {"level": 5, "name": "资深会员", "color": "#EF4444"}
    else:
        return {"level": 6, "name": "元老会员", "color": "#EC4899"}


# ── Helpers ───────────────────────────────────────────────────────────────────

def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def gen_id() -> str:
    return str(uuid.uuid4())


def _parse_tags(tags_value) -> List[str]:
    if isinstance(tags_value, list):
        return [str(t) for t in tags_value]
    if isinstance(tags_value, str):
        try:
            return json.loads(tags_value)
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def _topic_to_dict(t: Topic) -> dict:
    d = {
        "id": t.id, "title": t.title, "content": t.content,
        "author_id": t.author_id, "tags": _parse_tags(t.tags),
        "status": t.status, "source": t.source,
        "source_url": t.source_url, "source_name": t.source_name,
        "likes_count": t.likes_count or 0, "comments_count": t.comments_count or 0,
        "last_reply_user_id": t.last_reply_user_id,
        "last_reply_at": t.last_reply_at.isoformat() if t.last_reply_at else None,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }
    if hasattr(t, 'author_name'):
        d["author_name"] = t.author_name
        d["author_avatar"] = getattr(t, 'author_avatar', '')
    elif t.author:
        d["author_name"] = t.author.username
        d["author_avatar"] = t.author.avatar_url
    if hasattr(t, 'section_name'):
        d["section_name"] = t.section_name
        d["section_slug"] = getattr(t, 'section_slug', '')
    elif t.section:
        d["section_name"] = t.section.name
        d["section_slug"] = t.section.slug
    if hasattr(t, 'last_reply_username'):
        d["last_reply_username"] = t.last_reply_username
    return d


def _comment_to_dict(c: Comment) -> dict:
    return {
        "id": c.id, "topic_id": c.topic_id, "author_id": c.author_id,
        "parent_id": c.parent_id, "content": c.content, "status": c.status,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "author_name": c.author.username if c.author else "unknown",
        "author_avatar": c.author.avatar_url if c.author else "",
        "author_location": c.author.location if c.author else "",
    }


# ── Sections ──────────────────────────────────────────────────────────────────

async def get_all_sections() -> List[dict]:
    async with get_session() as session:
        result = await session.execute(select(Section).order_by(Section.sort_order))
        sections = result.scalars().all()
        return [{"id": s.id, "name": s.name, "slug": s.slug, "description": s.description, "sort_order": s.sort_order} for s in sections]


async def get_section(slug: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(select(Section).where(Section.slug == slug))
        s = result.scalar_one_or_none()
        return {"id": s.id, "name": s.name, "slug": s.slug, "description": s.description} if s else None


async def create_section(data: dict) -> dict:
    async with get_session() as session:
        s = Section(
            id=data.get("id") or f"sec-{data['slug']}",
            name=data["name"],
            slug=data["slug"],
            description=data.get("description", ""),
            sort_order=data.get("sort_order", 99),
        )
        session.add(s)
        await session.commit()
        await session.refresh(s)
        return {"id": s.id, "name": s.name, "slug": s.slug, "description": s.description, "sort_order": s.sort_order}


async def update_section(section_id: str, data: dict) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(select(Section).where(Section.id == section_id))
        s = result.scalar_one_or_none()
        if not s:
            return None
        for field in ("name", "description", "sort_order"):
            if field in data:
                setattr(s, field, data[field])
        await session.commit()
        await session.refresh(s)
        return {"id": s.id, "name": s.name, "slug": s.slug, "description": s.description, "sort_order": s.sort_order}


async def delete_section(section_id: str) -> bool:
    async with get_session() as session:
        result = await session.execute(select(Section).where(Section.id == section_id))
        s = result.scalar_one_or_none()
        if not s:
            return False
        await session.delete(s)
        await session.commit()
        return True


# ── Users ─────────────────────────────────────────────────────────────────────

async def get_user(user_id: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(select(User).where(User.id == user_id))
        u = result.scalar_one_or_none()
        return {c.name: getattr(u, c.name) for c in u.__table__.columns} if u else None


async def get_user_by_email(email: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.email == email, User.status != "deleted")
        )
        u = result.scalar_one_or_none()
        return {c.name: getattr(u, c.name) for c in u.__table__.columns} if u else None


async def get_user_by_username(username: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(User).where(User.username == username, User.status != "deleted")
        )
        u = result.scalar_one_or_none()
        return {c.name: getattr(u, c.name) for c in u.__table__.columns} if u else None


async def create_user(data: dict) -> dict:
    async with get_session() as session:
        user = User(
            id=data.get("id") or gen_id(),
            username=data["username"], email=data["email"],
            password_hash=data["password_hash"],
            role=data.get("role", "user"), status=data.get("status", "active"),
            avatar_url=data.get("avatar_url", ""),
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        return {c.name: getattr(user, c.name) for c in user.__table__.columns}


async def update_user(user_id: str, updates: dict) -> bool:
    async with get_session() as session:
        result = await session.execute(sa_update(User).where(User.id == user_id).values(**updates))
        await session.commit()
        return result.rowcount > 0


async def list_users(page=1, page_size=20, search="", status="", role="", sort_by="created_at", sort_desc=True) -> dict:
    async with get_session() as session:
        q = select(User)
        if search:
            q = q.where(or_(User.username.ilike(f"%{search}%"), User.email.ilike(f"%{search}%")))
        if status:
            q = q.where(User.status == status)
        else:
            q = q.where(User.status != "deleted")
        if role:
            q = q.where(User.role == role)
        else:
            q = q.where(User.role == "user")
        count = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar()
        sort_col = getattr(User, sort_by, User.created_at)
        q = q.order_by(sort_col.desc() if sort_desc else sort_col.asc())
        q = q.offset((page - 1) * page_size).limit(page_size)
        items = [{c.name: getattr(u, c.name) for c in u.__table__.columns} for u in (await session.execute(q)).scalars().all()]
        return {"items": items, "total": count, "page": page, "page_size": page_size}


# ── Topics ────────────────────────────────────────────────────────────────────

async def create_topic(data: dict) -> dict:
    async with get_session() as session:
        topic = Topic(
            id=data.get("id") or gen_id(),
            section_id=data.get("section_id", "sec-engineering"),
            title=data["title"], content=data["content"],
            author_id=data["author_id"], tags=data.get("tags", []),
            status=data.get("status", "published"), source=data.get("source", "user"),
            source_url=data.get("source_url", ""), source_name=data.get("source_name", ""),
            likes_count=data.get("likes_count", 0), comments_count=0,
        )
        session.add(topic)
        await session.commit()
        return await get_topic(topic.id)


async def get_topic(topic_id: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(Topic).options(joinedload(Topic.author), joinedload(Topic.section)).where(Topic.id == topic_id)
        )
        t = result.unique().scalar_one_or_none()
        if not t: return None
        d = _topic_to_dict(t)
        d["author_name"] = t.author.username
        d["author_avatar"] = t.author.avatar_url
        d["section_name"] = t.section.name
        d["section_slug"] = t.section.slug
        return d


async def get_topic_comments(topic_id: str) -> List[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(Comment).options(joinedload(Comment.author))
            .where(Comment.topic_id == topic_id, Comment.status != "deleted")
            .order_by(Comment.created_at.asc())
        )
        return [_comment_to_dict(c) for c in result.unique().scalars().all()]


async def get_comment_replies(parent_id: str) -> List[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(Comment).options(joinedload(Comment.author))
            .where(Comment.parent_id == parent_id, Comment.status != "deleted")
            .order_by(Comment.created_at.asc())
        )
        return [_comment_to_dict(c) for c in result.unique().scalars().all()]


async def update_topic(topic_id: str, updates: dict) -> bool:
    async with get_session() as session:
        result = await session.execute(sa_update(Topic).where(Topic.id == topic_id).values(**updates))
        await session.commit()
        return result.rowcount > 0


async def list_topics(page=1, page_size=20, search="", status="", tag="",
                     author_id="", source="", section_slug="",
                     sort_by="created_at", sort_desc=True) -> dict:
    async with get_session() as session:
        q = (select(Topic, User.username.label("author_name"), User.avatar_url.label("author_avatar"),
                    Section.name.label("section_name"), Section.slug.label("section_slug"))
             .join(User, Topic.author_id == User.id)
             .join(Section, Topic.section_id == Section.id)
             .where(Topic.status != "deleted"))

        if search: q = q.where(or_(Topic.title.ilike(f"%{search}%"), Topic.content.ilike(f"%{search}%")))
        if status: q = q.where(Topic.status == status)
        if tag: q = q.where(Topic.tags.cast(String).ilike(f'%"{tag}"%'))
        if author_id: q = q.where(Topic.author_id == author_id)
        if source: q = q.where(Topic.source == source)
        if section_slug: q = q.where(Section.slug == section_slug)

        count = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar()
        sort_map = {"created_at": Topic.created_at, "updated_at": Topic.updated_at,
                    "likes_count": Topic.likes_count, "comments_count": Topic.comments_count}
        sort_col = sort_map.get(sort_by, Topic.created_at)
        q = q.order_by(sort_col.desc() if sort_desc else sort_col.asc())
        q = q.offset((page - 1) * page_size).limit(page_size)

        items = []
        for row in (await session.execute(q)).all():
            d = _topic_to_dict(row[0])
            d["author_name"] = row.author_name
            d["author_avatar"] = row.author_avatar
            d["section_name"] = row.section_name
            d["section_slug"] = row.section_slug
            items.append(d)
        return {"items": items, "total": count, "page": page, "page_size": page_size}


# ── Comments ──────────────────────────────────────────────────────────────────

async def create_comment(data: dict) -> dict:
    async with get_session() as session:
        comment = Comment(
            id=data.get("id") or gen_id(), topic_id=data["topic_id"],
            author_id=data["author_id"], parent_id=data.get("parent_id"),
            content=data["content"], status=data.get("status", "published"),
        )
        session.add(comment)
        await session.execute(sa_update(Topic).where(Topic.id == data["topic_id"]).values(
            comments_count=Topic.comments_count + 1,
            last_reply_user_id=data["author_id"],
            last_reply_at=datetime.now(timezone.utc)))
        await session.commit()
        return await get_comment(comment.id)


async def get_comment(comment_id: str) -> Optional[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(Comment).options(joinedload(Comment.author)).where(Comment.id == comment_id))
        c = result.unique().scalar_one_or_none()
        return _comment_to_dict(c) if c else None


async def delete_comment(comment_id: str) -> bool:
    async with get_session() as session:
        result = await session.execute(sa_update(Comment).where(Comment.id == comment_id).values(status="deleted"))
        await session.commit()
        return result.rowcount > 0


# ── Reactions ─────────────────────────────────────────────────────────────────

async def toggle_reaction(user_id: str, target_type: str, target_id: str, emoji: str) -> dict:
    async with get_session() as session:
        result = await session.execute(
            select(Reaction).where(Reaction.user_id == user_id, Reaction.target_type == target_type,
                                    Reaction.target_id == target_id, Reaction.emoji == emoji))
        existing = result.scalar_one_or_none()
        if existing:
            await session.delete(existing); added = False
        else:
            session.add(Reaction(id=gen_id(), user_id=user_id, target_type=target_type, target_id=target_id, emoji=emoji))
            added = True
        await session.commit()
        return {"added": added, "reactions": await get_reactions(target_type, target_id)}


async def get_reactions(target_type: str, target_id: str) -> List[dict]:
    async with get_session() as session:
        result = await session.execute(
            select(Reaction.emoji, func.count(Reaction.id).label("count"))
            .where(Reaction.target_type == target_type, Reaction.target_id == target_id)
            .group_by(Reaction.emoji).order_by(func.count(Reaction.id).desc()))
        return [{"emoji": r.emoji, "count": r.count} for r in result.all()]


async def get_user_reactions(user_id: str, target_type: str, target_id: str) -> List[str]:
    async with get_session() as session:
        result = await session.execute(
            select(Reaction.emoji).where(Reaction.user_id == user_id, Reaction.target_type == target_type, Reaction.target_id == target_id))
        return list(result.scalars().all())


# ── Likes ─────────────────────────────────────────────────────────────────────

async def toggle_like(user_id: str, topic_id: str) -> dict:
    async with get_session() as session:
        result = await session.execute(
            select(Reaction).where(Reaction.user_id == user_id, Reaction.target_type == "post",
                                    Reaction.target_id == topic_id, Reaction.emoji == "❤️"))
        existing = result.scalar_one_or_none()
        if existing:
            await session.delete(existing)
            await session.execute(sa_update(Topic).where(Topic.id == topic_id).values(likes_count=Topic.likes_count - 1))
        else:
            session.add(Reaction(id=gen_id(), user_id=user_id, target_type="post", target_id=topic_id, emoji="❤️"))
            await session.execute(sa_update(Topic).where(Topic.id == topic_id).values(likes_count=Topic.likes_count + 1))
        await session.commit()
        t = await get_topic(topic_id)
        return {"liked": not existing, "likes_count": t["likes_count"] if t else 0}


# ── Tags ──────────────────────────────────────────────────────────────────────

async def get_all_tags() -> List[dict]:
    async with get_session() as session:
        result = await session.execute(select(Topic.tags).where(Topic.status.notin_(["deleted", "hidden"])))
        tag_counts: dict[str, int] = {}
        for (tags,) in result.all():
            for tag in _parse_tags(tags):
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
        return [{"name": k, "count": v} for k, v in sorted(tag_counts.items(), key=lambda x: -x[1])]


# ── Admin Logs ────────────────────────────────────────────────────────────────

async def log_admin_action(admin_id, admin_name, action, target_type="", target_id="", reason="", detail=None) -> dict:
    async with get_session() as session:
        log = AdminLog(id=gen_id(), admin_id=admin_id, admin_name=admin_name, action=action,
                       target_type=target_type, target_id=target_id, reason=reason, detail=detail or {})
        session.add(log)
        await session.commit()
        await session.refresh(log)
        d = {c.name: getattr(log, c.name) for c in log.__table__.columns}
        if isinstance(d.get("detail"), str):
            try: d["detail"] = json.loads(d["detail"])
            except: d["detail"] = {}
        if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
        return d


async def list_admin_logs(page=1, page_size=20, admin_id="", action="") -> dict:
    async with get_session() as session:
        q = select(AdminLog).order_by(AdminLog.created_at.desc())
        if admin_id: q = q.where(AdminLog.admin_id == admin_id)
        if action: q = q.where(AdminLog.action == action)
        count = (await session.execute(select(func.count()).select_from(q.subquery()))).scalar()
        q = q.offset((page - 1) * page_size).limit(page_size)
        items = []
        for log in (await session.execute(q)).scalars().all():
            d = {c.name: getattr(log, c.name) for c in log.__table__.columns}
            if isinstance(d.get("detail"), str):
                try: d["detail"] = json.loads(d["detail"])
                except: d["detail"] = {}
            if d.get("created_at"): d["created_at"] = d["created_at"].isoformat()
            items.append(d)
        return {"items": items, "total": count, "page": page, "page_size": page_size}


# ── Stats ─────────────────────────────────────────────────────────────────────

async def get_stats() -> dict:
    async with get_session() as session:
        return {
            "total_users": (await session.execute(select(func.count(User.id)))).scalar(),
            "active_users": (await session.execute(select(func.count(User.id)).where(User.status == "active"))).scalar(),
            "banned_users": (await session.execute(select(func.count(User.id)).where(User.status == "banned"))).scalar(),
            "total_posts": (await session.execute(select(func.count(Topic.id)))).scalar(),
            "active_posts": (await session.execute(select(func.count(Topic.id)).where(Topic.status == "published"))).scalar(),
            "pending_review": (await session.execute(select(func.count(Topic.id)).where(Topic.status == "pending_review"))).scalar(),
            "hidden_posts": (await session.execute(select(func.count(Topic.id)).where(Topic.status == "hidden"))).scalar(),
            "deleted_posts": (await session.execute(select(func.count(Topic.id)).where(Topic.status == "deleted"))).scalar(),
            "crawler_posts": (await session.execute(select(func.count(Topic.id)).where(Topic.source == "crawler"))).scalar(),
            "total_comments": (await session.execute(select(func.count(Comment.id)))).scalar(),
            "total_likes": (await session.execute(select(func.count(Reaction.id)).where(Reaction.emoji == "❤️"))).scalar(),
            "total_admin_actions": (await session.execute(select(func.count(AdminLog.id)))).scalar(),
            "sections": await get_all_sections(),
            "tags": await get_all_tags(),
        }
