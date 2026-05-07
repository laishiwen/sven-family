from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import StoreService, StoreOperationJob
from app.schemas import (
    StoreServiceCreate,
    StoreServiceResponse,
    RuntimeConfigResponse,
    StoreOperationRequest,
    StoreOperationResponse,
)
from app.core.config import settings
from datetime import datetime
from pathlib import Path
import json
import shutil
import os

store_router = APIRouter(prefix="/store", tags=["Store"])
settings_router = APIRouter(prefix="/settings", tags=["Settings"])

_SQL_SERVICE_TYPES = {"sqlite", "postgresql", "mysql", "mongodb"}


def _milvus_lite_is_healthy(connection_url: str | None) -> tuple[str, str | None]:
    target = Path(connection_url or settings.MILVUS_LITE_PATH)
    try:
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            target.touch(exist_ok=True)
        return "healthy", None
    except Exception as exc:
        return "unhealthy", str(exc)


def _is_database_service(service: StoreService) -> bool:
    if (service.category or "").lower() == "database":
        return True
    return (service.service_type or "").lower() in _SQL_SERVICE_TYPES


def _default_store_services() -> list[StoreService]:
    now = datetime.utcnow()
    return [
        StoreService(
            id="default-sqlite",
            name="SQLite (Local)",
            service_type="sqlite",
            category="database",
            connection_url=settings.SQLITE_PATH,
            config_json="{}",
            enabled_capabilities_json='["query","export","import","migrate"]',
            health_status="healthy",
            is_default=True,
            created_at=now,
            updated_at=now,
        ),
        StoreService(
            id="default-milvus",
            name="Milvus-Lite (Local)",
            service_type="milvus",
            category="vector",
            connection_url=settings.MILVUS_LITE_PATH,
            config_json="{}",
            enabled_capabilities_json='["vector-search","export","import"]',
            health_status="healthy",
            is_default=True,
            created_at=now,
            updated_at=now,
        ),
    ]


# Store
@store_router.get("/services", response_model=list[StoreServiceResponse])
async def list_services(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(StoreService))
    services = result.all()
    if not services:
        defaults = _default_store_services()
        for service in defaults:
            session.add(service)
        await session.commit()
        return defaults

    changed = False
    cleaned_services: list[StoreService] = []

    # Clean up legacy Redis rows after Redis removal from studio runtime.
    for service in services:
        if (service.service_type or "").lower() == "redis":
            await session.delete(service)
            changed = True
            continue
        cleaned_services.append(service)

    existing_ids = {service.id for service in cleaned_services}
    defaults = _default_store_services()
    for default_service in defaults:
        if default_service.id not in existing_ids:
            session.add(default_service)
            changed = True

    # Normalize old Milvus-Lite rows that were left as unknown.
    now = datetime.utcnow()
    for service in cleaned_services:
        if (service.service_type or "").lower() == "milvus" and service.health_status in {"unknown", "", None}:
            status, _ = _milvus_lite_is_healthy(service.connection_url)
            service.health_status = status
            service.last_checked_at = now
            session.add(service)
            changed = True

    if changed:
        await session.commit()
        result = await session.exec(select(StoreService))
        services = result.all()
        return [s for s in services if (s.service_type or "").lower() != "redis"]

    return cleaned_services


@store_router.post("/services", response_model=StoreServiceResponse, status_code=201)
async def create_service(body: StoreServiceCreate, session: AsyncSession = Depends(get_session)):
    service = StoreService(**body.model_dump())
    session.add(service)
    await session.commit()
    await session.refresh(service)
    return service


@store_router.delete("/services/{service_id}")
async def delete_service(service_id: str, session: AsyncSession = Depends(get_session)):
    service = await session.get(StoreService, service_id)
    if not service:
        raise HTTPException(404, "Service not found")

    result = await session.exec(select(StoreService))
    services = result.all()
    if _is_database_service(service):
        database_services = [item for item in services if _is_database_service(item)]
        if len(database_services) <= 1:
            raise HTTPException(400, "当前仅剩一个数据库连接，不能删除")

    await session.delete(service)
    await session.commit()
    return {"id": service_id, "status": "deleted"}


@store_router.post("/services/{service_id}/health-check")
async def health_check_service(service_id: str, session: AsyncSession = Depends(get_session)):
    service = await session.get(StoreService, service_id)
    status = "healthy"
    error = None

    if service:
        try:
            if service.service_type == "redis":
                # Redis has been removed from studio runtime.
                status = "unavailable"
                error = "Redis is disabled in studio backend"
            elif service.service_type == "milvus":
                status, error = _milvus_lite_is_healthy(service.connection_url)
        except Exception as e:
            status = "unhealthy"
            error = str(e)

        service.health_status = status
        service.last_checked_at = datetime.utcnow()
        session.add(service)
        await session.commit()

    return {"service_id": service_id, "status": status, "error": error}


@store_router.get("/operations", response_model=list[StoreOperationResponse])
async def list_store_operations(session: AsyncSession = Depends(get_session)):
    result = await session.exec(
        select(StoreOperationJob).order_by(StoreOperationJob.created_at.desc())
    )
    return result.all()


@store_router.post("/operations/export", response_model=StoreOperationResponse, status_code=201)
async def export_store_service(
    body: StoreOperationRequest,
    session: AsyncSession = Depends(get_session),
):
    if not body.service_id:
        raise HTTPException(400, "service_id is required")

    service = await session.get(StoreService, body.service_id)
    if not service and body.service_id != "default-sqlite":
        raise HTTPException(404, "Service not found")

    export_dir = Path(settings.APP_DATA_DIR) / "exports"
    export_dir.mkdir(parents=True, exist_ok=True)
    job = StoreOperationJob(
        service_id=body.service_id,
        operation_type="export",
        status="running",
        payload_json=body.payload_json,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    try:
        artifact_path: Path
        if body.service_id == "default-sqlite" or (service and service.service_type == "sqlite" and body.include_data):
            source_path = Path(service.connection_url if service else settings.SQLITE_PATH)
            artifact_path = export_dir / f"{job.id}.db"
            shutil.copy2(source_path, artifact_path)
        else:
            manifest = {
                "service": {
                    "name": service.name if service else "SQLite (Local)",
                    "service_type": service.service_type if service else "sqlite",
                    "category": service.category if service else "database",
                    "connection_url": service.connection_url if service else settings.SQLITE_PATH,
                    "config_json": service.config_json if service else "{}",
                    "enabled_capabilities_json": service.enabled_capabilities_json if service else '[]',
                },
                "exported_at": datetime.utcnow().isoformat(),
            }
            artifact_path = export_dir / f"{job.id}.json"
            artifact_path.write_text(json.dumps(manifest, ensure_ascii=True, indent=2), encoding="utf-8")

        job.status = "completed"
        job.artifact_path = str(artifact_path)
        job.completed_at = datetime.utcnow()
    except Exception as exc:
        job.status = "failed"
        job.error_msg = str(exc)

    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


@store_router.post("/operations/import", response_model=StoreOperationResponse, status_code=201)
async def import_store_service(
    body: StoreOperationRequest,
    session: AsyncSession = Depends(get_session),
):
    if not body.file_path:
        raise HTTPException(400, "file_path is required")

    source_path = Path(body.file_path)
    if not source_path.exists():
        raise HTTPException(404, "Import file not found")

    job = StoreOperationJob(
        operation_type="import",
        status="running",
        payload_json=body.payload_json,
        artifact_path=str(source_path),
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    try:
        if source_path.suffix == ".json":
            payload = json.loads(source_path.read_text(encoding="utf-8"))
            service_payload = payload.get("service", {})
            service = StoreService(
                name=service_payload.get("name") or source_path.stem,
                service_type=service_payload.get("service_type") or "custom",
                category=service_payload.get("category") or "database",
                connection_url=service_payload.get("connection_url"),
                config_json=service_payload.get("config_json") or "{}",
                enabled_capabilities_json=service_payload.get("enabled_capabilities_json") or "[]",
                health_status="unknown",
            )
            session.add(service)
            await session.commit()
            await session.refresh(service)
            job.service_id = service.id
        else:
            service = StoreService(
                name=source_path.stem,
                service_type="sqlite",
                category="database",
                connection_url=str(source_path),
                config_json="{}",
                enabled_capabilities_json='["query","export","import","migrate"]',
                health_status="healthy",
            )
            session.add(service)
            await session.commit()
            await session.refresh(service)
            job.service_id = service.id

        job.status = "completed"
        job.completed_at = datetime.utcnow()
    except Exception as exc:
        job.status = "failed"
        job.error_msg = str(exc)

    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


@store_router.post("/operations/migrate", response_model=StoreOperationResponse, status_code=201)
async def migrate_store_service(
    body: StoreOperationRequest,
    session: AsyncSession = Depends(get_session),
):
    if not body.source_service_id or not body.target_service_id:
        raise HTTPException(400, "source_service_id and target_service_id are required")

    source_service = await session.get(StoreService, body.source_service_id)
    target_service = await session.get(StoreService, body.target_service_id)
    if not source_service or not target_service:
        raise HTTPException(404, "Source or target service not found")

    job = StoreOperationJob(
        source_service_id=source_service.id,
        target_service_id=target_service.id,
        operation_type="migrate",
        status="running",
        payload_json=body.payload_json,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)

    try:
        details = {
            "source": source_service.name,
            "target": target_service.name,
            "performed_at": datetime.utcnow().isoformat(),
            "mode": "config-only",
        }
        if source_service.service_type == "sqlite" and target_service.service_type == "sqlite":
            source_path = Path(source_service.connection_url or settings.SQLITE_PATH)
            target_path = Path(target_service.connection_url or settings.SQLITE_PATH)
            target_path.parent.mkdir(parents=True, exist_ok=True)
            if source_path.exists() and source_path != target_path:
                shutil.copy2(source_path, target_path)
                details["mode"] = "sqlite-copy"

        job.payload_json = json.dumps(details, ensure_ascii=True)
        job.status = "completed"
        job.completed_at = datetime.utcnow()
    except Exception as exc:
        job.status = "failed"
        job.error_msg = str(exc)

    session.add(job)
    await session.commit()
    await session.refresh(job)
    return job


# Settings
ENV_VAR_META = [
    {"key": "APP_ENV", "source": "env", "description": "运行环境", "is_sensitive": False, "group": "app"},
    {"key": "APP_HOST", "source": "env", "description": "监听地址", "is_sensitive": False, "group": "app"},
    {"key": "APP_PORT", "source": "env", "description": "监听端口", "is_sensitive": False, "group": "app"},
    {"key": "SQLITE_PATH", "source": "env", "description": "SQLite 数据库路径", "is_sensitive": False, "group": "database"},
    {"key": "MILVUS_LITE_PATH", "source": "env", "description": "Milvus-Lite 路径", "is_sensitive": False, "group": "database"},
    {"key": "LANGFUSE_HOST", "source": "env", "description": "Langfuse 服务地址", "is_sensitive": False, "group": "observability"},
    {"key": "LANGFUSE_PUBLIC_KEY", "source": "env", "description": "Langfuse 公钥", "is_sensitive": True, "group": "observability"},
    {"key": "LANGFUSE_SECRET_KEY", "source": "env", "description": "Langfuse 私钥", "is_sensitive": True, "group": "observability"},
    {"key": "APP_DATA_DIR", "source": "env", "description": "数据目录", "is_sensitive": False, "group": "storage"},
    {"key": "APP_LOG_DIR", "source": "env", "description": "日志目录", "is_sensitive": False, "group": "storage"},
    {"key": "TRAINING_OUTPUT_DIR", "source": "env", "description": "训练输出目录", "is_sensitive": False, "group": "training"},
    {"key": "MODEL_CACHE_DIR", "source": "env", "description": "模型缓存目录", "is_sensitive": False, "group": "training"},
    {"key": "WEB_DIST_DIR", "source": "env", "description": "桌面端前端静态资源目录", "is_sensitive": False, "group": "desktop"},
    {"key": "SEARCH_DEFAULT_PROVIDER", "source": "env", "description": "默认联网搜索提供商", "is_sensitive": False, "group": "search"},
    {"key": "SEARCH_TAVILY_API_KEY", "source": "env", "description": "Tavily API Key", "is_sensitive": True, "group": "search"},
    {"key": "SEARCH_BRAVE_API_KEY", "source": "env", "description": "Brave Search API Key", "is_sensitive": True, "group": "search"},
    {"key": "SEARCH_SERPAPI_KEY", "source": "env", "description": "SerpAPI Key", "is_sensitive": True, "group": "search"},
]


@settings_router.get("/environment", response_model=list[RuntimeConfigResponse])
async def get_environment_config():
    result = []
    for meta in ENV_VAR_META:
        key = meta["key"]
        raw_value = os.environ.get(key) or getattr(settings, key, None)
        value_preview = None
        if raw_value and not meta["is_sensitive"]:
            value_preview = str(raw_value)
        elif raw_value and meta["is_sensitive"]:
            value_preview = "***" if raw_value else None

        source = "system" if os.environ.get(key) else "default"

        result.append(RuntimeConfigResponse(
            key=key,
            source=source,
            description=meta["description"],
            is_sensitive=meta["is_sensitive"],
            group=meta["group"],
            value_preview=value_preview,
        ))
    return result


@settings_router.get("/runtime")
async def get_runtime_info():
    import sys
    return {
        "python_version": sys.version,
        "app_env": settings.APP_ENV,
        "data_dir": settings.APP_DATA_DIR,
        "log_dir": settings.APP_LOG_DIR,
        "sqlite_path": settings.SQLITE_PATH,
        "web_dist_dir": settings.WEB_DIST_DIR,
        "search_default_provider": settings.SEARCH_DEFAULT_PROVIDER,
    }


@settings_router.post("/test-directory")
async def test_directory_write(body: dict):
    """Test if a directory path is writable"""
    path = body.get("path", "")
    from pathlib import Path
    try:
        p = Path(path)
        p.mkdir(parents=True, exist_ok=True)
        test_file = p / ".write_test"
        test_file.write_text("test")
        test_file.unlink()
        return {"path": path, "writable": True}
    except Exception as e:
        return {"path": path, "writable": False, "error": str(e)}
