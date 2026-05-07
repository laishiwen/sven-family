from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    # App
    app_name: str = "Sven Stats Service"
    debug: bool = False
    
    # Database
    database_url: str = Field(default="postgresql+asyncpg://postgres:123456@localhost:5432/butler")
    
    # CORS
    cors_origins: list[str] = Field(default=["*"], validation_alias="STATS_CORS_ORIGINS")
    
    # Stats
    batch_timeout: int = 5  # seconds
    batch_size: int = 100
    
    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
