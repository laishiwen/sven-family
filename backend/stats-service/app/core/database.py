import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession as AsyncSessionBase
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select, func
from sqlalchemy.engine import make_url
from sqlalchemy import text
from app.core.config import settings

logger = logging.getLogger(__name__)


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


engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    future=True,
    pool_size=20,
    max_overflow=10,
    pool_pre_ping=True,
)

async_session = sessionmaker(
    engine, class_=AsyncSessionBase, expire_on_commit=False, autocommit=False, autoflush=False
)


async def get_session() -> AsyncSessionBase:
    async with async_session() as session:
        yield session


async def init_db():
    """Initialize database tables"""
    await _ensure_database_exists(settings.database_url)
    async with engine.begin() as conn:
        # Create all tables
        await conn.run_sync(SQLModel.metadata.create_all)
        logger.info("Database initialized successfully")


async def close_db():
    """Close database connection"""
    await engine.dispose()
