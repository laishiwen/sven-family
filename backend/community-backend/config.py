"""Configuration for Community Backend Server."""

import json

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    # ── 运行模式 ─────────────────────────────────────────────────────────────
    app_mode: str = "both"  # public | admin | both

    # ── 自身服务 ─────────────────────────────────────────────────────────────
    app_host: str = "0.0.0.0"
    app_port: int = 50051
    app_name: str = "Community Backend"

    # ── 数据库（连接存储设施）────────────────────────────────────────────────
    database_url: str = "postgresql+asyncpg://postgres:123456@localhost:5432/community"

    # ── JWT 鉴权 ───────────────────────────────────────────────────────────────
    jwt_secret_key: str = "community-dev-jwt-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 168  # 7 days

    # ── CORS（允许前端来源）──────────────────────────────────────────────────
    cors_origins: list[str] = Field(default=[], validation_alias="COMMUNITY_CORS_ORIGINS")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, value):
        # Accept both JSON array and legacy comma-separated string.
        if isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                    if isinstance(parsed, list):
                        return [str(item).strip() for item in parsed if str(item).strip()]
                except Exception:
                    pass
            return [item.strip() for item in raw.split(",") if item.strip()]
        if isinstance(value, (list, tuple, set)):
            return [str(item).strip() for item in value if str(item).strip()]
        return value


settings = Settings()
