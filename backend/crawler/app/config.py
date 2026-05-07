"""Crawler configuration via pydantic-settings BaseSettings.

Replaces the previous os.getenv() approach with typed, validated settings.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class CrawlerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Bridge ──────────────────────────────────────────────────────────────────
    community_bridge_url: str

    # ── Redis ───────────────────────────────────────────────────────────────────
    redis_url: str = "redis://localhost:6379/0"

    # ── Logging ─────────────────────────────────────────────────────────────────
    crawler_log_level: str = "INFO"

    # ── Spider Schedules (cron expressions) ─────────────────────────────────────
    spider_hackernews_schedule: str = "0 */2 * * *"
    spider_devto_schedule: str = "0 */4 * * *"
    spider_github_trending_schedule: str = "0 */6 * * *"

    # ── Spider Content Limits ───────────────────────────────────────────────────
    spider_max_articles_per_run: int = 1
    spider_max_content_length: int = 2000

    # ── Ingestion ───────────────────────────────────────────────────────────────
    crawler_auto_publish: bool = True
    crawler_request_timeout: int = 30

    # ── Dedup ───────────────────────────────────────────────────────────────────
    dedup_ttl_days: int = 7

    # ── Health check server ─────────────────────────────────────────────────────
    health_check_port: int = 9100


settings = CrawlerSettings()
