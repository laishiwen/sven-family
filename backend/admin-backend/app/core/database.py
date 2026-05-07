import logging
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
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
    echo=False,
    pool_size=5,
    max_overflow=10,
)
async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

_engine_ok = False


async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        yield session


async def init_db():
    global _engine_ok
    await _ensure_database_exists(settings.database_url)
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    _engine_ok = True
    logger.info("Database ready (PostgreSQL)")
