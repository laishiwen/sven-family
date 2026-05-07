import hashlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from sqlmodel import select, func

from app.core.config import settings
from app.core.database import init_db, async_session_factory
from app.api.v1.router import router as v1_router
from app.models.admin import AdminUser, CrawlerJob
from app.services.crawler_scheduler import start_crawler_scheduler, stop_crawler_scheduler

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


async def seed_default_admin():
    async with async_session_factory() as session:
        result = await session.exec(select(func.count(AdminUser.id)))
        if result.one() > 0:
            return
        admin = AdminUser(
            username="admin",
            email="admin@sven.studio",
            password_hash=pwd_context.hash(hashlib.sha256("admin123".encode()).hexdigest()),
            role="super_admin",
            status="active",
        )
        session.add(admin)
        await session.commit()
        logger.info("Seeded default admin: admin / admin123")


async def seed_default_crawler_jobs():
    async with async_session_factory() as session:
        existing = await session.exec(
            select(CrawlerJob).where(CrawlerJob.job_key == "ai_news")
        )
        if existing.first():
            return

        job = CrawlerJob(
            job_key="ai_news",
            name="AI 新闻抓取",
            description="抓取 Hacker News 中与 AI/LLM 相关的热门新闻并注入社区",
            schedule_cron="0 */2 * * *",
            enabled=True,
            auto_publish=False,
        )
        session.add(job)
        await session.commit()
        logger.info("Seeded default crawler job: ai_news")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await init_db()
        await seed_default_admin()
        await seed_default_crawler_jobs()
        await start_crawler_scheduler()
    except Exception as e:
        logger.warning(f"Database init failed (will retry on first request): {e}")
    yield
    stop_crawler_scheduler()


app = FastAPI(
    title="Admin Backend",
    description="Admin panel backend API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(v1_router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok"}
