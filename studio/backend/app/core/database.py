from dataclasses import dataclass
import logging

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.sqlite_url,
    echo=settings.APP_ENV == "development",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)

async_session_factory = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


async def get_session() -> AsyncSession:
    async with async_session_factory() as session:
        yield session


@dataclass(frozen=True)
class ColumnMigration:
    table: str
    column: str
    definition: str


SQLITE_COLUMN_MIGRATIONS = [
    ColumnMigration("models", "owned_by", "owned_by TEXT"),
    ColumnMigration("mcp_servers", "source", "source TEXT DEFAULT 'custom'"),
    ColumnMigration(
        "knowledge_bases",
        "embedding_provider_type",
        "embedding_provider_type TEXT",
    ),
    ColumnMigration("knowledge_bases", "reranker_model_id", "reranker_model_id TEXT"),
    ColumnMigration(
        "knowledge_bases",
        "chunk_strategy",
        "chunk_strategy TEXT DEFAULT 'sentence'",
    ),
    ColumnMigration("knowledge_bases", "metadata_mode", "metadata_mode TEXT DEFAULT 'auto'"),
    ColumnMigration(
        "knowledge_bases",
        "metadata_template_json",
        "metadata_template_json TEXT DEFAULT '{}'",
    ),
    ColumnMigration(
        "knowledge_bases",
        "parser_config_json",
        "parser_config_json TEXT DEFAULT '{}'",
    ),
    ColumnMigration(
        "knowledge_bases",
        "retrieval_config_json",
        "retrieval_config_json TEXT DEFAULT '{}'",
    ),
    ColumnMigration("datasets", "output_path", "output_path TEXT"),
    ColumnMigration("datasets", "processing_config_json", "processing_config_json TEXT DEFAULT '{}'"),
    ColumnMigration("datasets", "split_config_json", "split_config_json TEXT DEFAULT '{}'"),
    ColumnMigration("chat_sessions", "reasoning_mode", "reasoning_mode TEXT DEFAULT 'standard'"),
    ColumnMigration("chat_sessions", "stream_output", "stream_output BOOLEAN DEFAULT 0"),
    ColumnMigration("chat_sessions", "search_enabled", "search_enabled BOOLEAN DEFAULT 0"),
    ColumnMigration("chat_sessions", "search_provider", "search_provider TEXT"),
    ColumnMigration("chat_sessions", "search_config_json", "search_config_json TEXT DEFAULT '{}'"),
    ColumnMigration("agents", "prompt_ids_json", "prompt_ids_json TEXT DEFAULT '[]'"),
    ColumnMigration(
        "agents",
        "structured_output_enabled",
        "structured_output_enabled BOOLEAN DEFAULT 0",
    ),
    ColumnMigration(
        "agents",
        "structured_output_schema_json",
        "structured_output_schema_json TEXT DEFAULT '{}'",
    ),
    ColumnMigration("runs", "trace_provider", "trace_provider TEXT"),
    ColumnMigration("runs", "metadata_json", "metadata_json TEXT DEFAULT '{}'"),
    ColumnMigration("run_steps", "parent_step_id", "parent_step_id TEXT"),
    ColumnMigration("run_steps", "step_index", "step_index INTEGER DEFAULT 0"),
    ColumnMigration("run_steps", "metadata_json", "metadata_json TEXT DEFAULT '{}'"),
    ColumnMigration("run_steps", "status", "status TEXT DEFAULT 'completed'"),
    ColumnMigration("run_steps", "latency_ms", "latency_ms INTEGER DEFAULT 0"),
    ColumnMigration("store_services", "category", "category TEXT DEFAULT 'database'"),
    ColumnMigration("tools", "is_builtin", "is_builtin BOOLEAN DEFAULT 0"),
    ColumnMigration("mcp_servers", "is_builtin", "is_builtin BOOLEAN DEFAULT 0"),
    ColumnMigration(
        "store_services",
        "enabled_capabilities_json",
        "enabled_capabilities_json TEXT DEFAULT '[]'",
    ),
    # Agent new fields — subagents / working directory / HITL
    ColumnMigration("agents", "sub_agent_ids_json", "sub_agent_ids_json TEXT DEFAULT '[]'"),
    ColumnMigration("agents", "working_directory", "working_directory TEXT"),
    ColumnMigration("agents", "hitl_enabled", "hitl_enabled BOOLEAN DEFAULT 0"),
    ColumnMigration("agents", "hitl_approval_level", "hitl_approval_level TEXT DEFAULT 'tool_call'"),
    ColumnMigration("agents", "sub_agent_max_depth", "sub_agent_max_depth INTEGER DEFAULT 1"),
    # Prompt source field
    ColumnMigration("prompts", "source", "source TEXT DEFAULT 'custom'"),
    # Memory fields
    ColumnMigration("models", "memory_enabled", "memory_enabled BOOLEAN DEFAULT 0"),
    ColumnMigration("agents", "memory_enabled", "memory_enabled BOOLEAN DEFAULT 1"),
    ColumnMigration("chat_sessions", "memory_enabled", "memory_enabled BOOLEAN DEFAULT 0"),
]


async def _column_exists(conn, table: str, column: str) -> bool:
    rows = await conn.execute(text(f'PRAGMA table_info("{table}")'))
    return any(row[1] == column for row in rows)


async def _add_column_if_missing(conn, migration: ColumnMigration) -> bool:
    if await _column_exists(conn, migration.table, migration.column):
        return False

    await conn.execute(
        text(f'ALTER TABLE "{migration.table}" ADD COLUMN {migration.definition}')
    )
    return True


async def _run_sqlite_migrations(conn) -> None:
    applied: list[str] = []
    for migration in SQLITE_COLUMN_MIGRATIONS:
        try:
            if await _add_column_if_missing(conn, migration):
                applied.append(f"{migration.table}.{migration.column}")
        except Exception as exc:
            logger.warning(
                "SQLite migration skipped for %s.%s: %s",
                migration.table,
                migration.column,
                exc,
            )

    if applied:
        logger.info("Applied SQLite migrations: %s", ", ".join(applied))


async def init_db():
    from app.models import all_models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
        await _run_sqlite_migrations(conn)
    logger.info("Database initialized")
    await _seed_if_empty()


async def _seed_if_empty():
    from app.models import Tool
    from app.services.seed import seed_all
    async with async_session_factory() as session:
        result = await session.exec(select(Tool).where(Tool.is_builtin == True).limit(1))
        if result.first():
            return
        count = await seed_all(session)
        logger.info("Seed data applied: %s", count)
