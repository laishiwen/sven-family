import logging
import os
from pathlib import Path
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent

logger = logging.getLogger("app.config")

_DEFAULT_JWT_SECRET = "dev-secret-change-in-production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = "postgresql+asyncpg://postgres:123456@localhost:5432/butler"
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = _DEFAULT_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480
    cors_origins: List[str] = Field(
        default_factory=list,
        validation_alias="ADMIN_CORS_ORIGINS",
    )
    community_bridge_url: str
    crawler_service_url: str
    stats_service_url: str

settings = Settings()

# Warn if default JWT secret is used in production
if settings.jwt_secret_key == _DEFAULT_JWT_SECRET and os.getenv("ENV", "").lower() in ("production", "prod", "staging"):
    logger.warning(
        "Using default JWT secret key in production! Set JWT_SECRET_KEY env var."
    )
