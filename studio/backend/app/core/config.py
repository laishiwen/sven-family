from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
import os
import shutil
import sys

# Resolve paths relative to this file (apps/api/), not CWD
_API_DIR = Path(__file__).parent.parent.parent  # apps/api/
_WORKSPACE_DIR = _API_DIR.parent.parent  # repo root
_ENV_APP_DATA_DIR = os.getenv("APP_DATA_DIR")


def _default_app_data_dir() -> Path:
    if sys.platform == "darwin":
        return Path.home() / "Data" / "SvenStudio" / "AppData"
    return _WORKSPACE_DIR / "data"


_EFFECTIVE_DATA_DIR = Path(_ENV_APP_DATA_DIR) if _ENV_APP_DATA_DIR else _default_app_data_dir()
_DEFAULT_DATA_DIR = str(_EFFECTIVE_DATA_DIR)
_DEFAULT_SQLITE_PATH = os.getenv(
    "SQLITE_PATH",
    str(_EFFECTIVE_DATA_DIR / "sven_studio.db"),
)
_DEFAULT_LOG_DIR = os.getenv("APP_LOG_DIR", str(_API_DIR / "logs"))
_DEFAULT_MILVUS_LITE_PATH = os.getenv(
    "MILVUS_LITE_PATH",
    str(_EFFECTIVE_DATA_DIR / "vector_store" / "milvus_lite.db"),
)
_DEFAULT_MANAGED_RUNTIME_DIR = os.getenv(
    "MANAGED_RUNTIME_DIR",
    str(_EFFECTIVE_DATA_DIR / "managed_runtime"),
)
_DEFAULT_WEB_DIST_DIR = str(_API_DIR.parent / "web" / "dist")
_DEFAULT_SKILLS_DIR = os.getenv(
    "SKILLS_DIR",
    str(_EFFECTIVE_DATA_DIR / "skills"),
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    APP_ENV: str = "development"
    APP_HOST: str = "127.0.0.1"
    APP_PORT: int = 8000
    APP_LOG_LEVEL: str = "info"

    # Data
    APP_DATA_DIR: str = _DEFAULT_DATA_DIR
    APP_LOG_DIR: str = _DEFAULT_LOG_DIR
    SQLITE_PATH: str = _DEFAULT_SQLITE_PATH
    MILVUS_LITE_PATH: str = _DEFAULT_MILVUS_LITE_PATH

    # Langfuse
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"
    LANGFUSE_PUBLIC_KEY: str = ""
    LANGFUSE_SECRET_KEY: str = ""

    # MCP
    MCP_DEFAULT_TIMEOUT: int = 30
    MANAGED_RUNTIME_DIR: str = _DEFAULT_MANAGED_RUNTIME_DIR
    MANAGED_NODE_VERSION: str = "v20.12.2"
    MANAGED_NPM_REGISTRY: str = "https://registry.npmjs.org"
    MANAGED_RUNTIME_TIMEOUT_SEC: int = 300
    SKILLS_CLI_PACKAGE: str = "skills"
    MCP_CLI_PACKAGE: str = "@getmcp/cli"

    # Files
    FILE_UPLOAD_MAX_MB: int = 100
    SKILLS_DIR: str = _DEFAULT_SKILLS_DIR
    MODEL_CACHE_DIR: str = os.getenv(
        "MODEL_CACHE_DIR",
        str(_EFFECTIVE_DATA_DIR / "model_cache"),
    )
    TRAINING_OUTPUT_DIR: str = os.getenv(
        "TRAINING_OUTPUT_DIR",
        str(_EFFECTIVE_DATA_DIR / "training"),
    )
    WEB_DIST_DIR: str = _DEFAULT_WEB_DIST_DIR
    SEARCH_DEFAULT_PROVIDER: str = "tavily"
    SEARCH_TAVILY_API_KEY: str = ""
    SEARCH_BRAVE_API_KEY: str = ""
    SEARCH_SERPAPI_KEY: str = ""

    @property
    def sqlite_url(self) -> str:
        return f"sqlite+aiosqlite:///{self.SQLITE_PATH}"

    @property
    def data_dir(self) -> Path:
        return Path(self.APP_DATA_DIR)

    @property
    def web_dist_dir(self) -> Path:
        return Path(self.WEB_DIST_DIR)

    def _merge_tree(self, source: Path, target: Path):
        if not source.exists():
            return

        if source.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(source, target)
            return

        target.mkdir(parents=True, exist_ok=True)
        for entry in source.iterdir():
            self._merge_tree(entry, target / entry.name)

    def migrate_legacy_storage(self):
        target_data_dir = Path(self.APP_DATA_DIR)
        target_log_dir = Path(self.APP_LOG_DIR)
        target_data_dir.mkdir(parents=True, exist_ok=True)
        target_log_dir.mkdir(parents=True, exist_ok=True)

        legacy_data_dirs = [
            _API_DIR / "data",
            Path.cwd() / "data",
        ]
        legacy_log_dirs = [
            _API_DIR / "logs",
            Path.cwd() / "logs",
        ]

        data_names = [
            "sven_studio.db",
            "milvus.db",
            "managed_runtime",
            "uploads",
            "vector_store",
            "model_cache",
            "training",
        ]

        for legacy_dir in legacy_data_dirs:
            if legacy_dir.resolve() == target_data_dir.resolve():
                continue
            for name in data_names:
                source = legacy_dir / name
                if name == "milvus.db":
                    self._merge_tree(source, Path(self.MILVUS_LITE_PATH))
                    continue
                self._merge_tree(source, target_data_dir / name)

        # Migrate existing milvus file from legacy vector_store if present.
        for legacy_dir in legacy_data_dirs:
            source = legacy_dir / "vector_store" / "milvus_lite.db"
            self._merge_tree(source, Path(self.MILVUS_LITE_PATH))

        # Keep managed runtime / model cache / training paths aligned with APP_DATA_DIR.
        self._merge_tree(Path(self.MANAGED_RUNTIME_DIR), target_data_dir / "managed_runtime")
        self._merge_tree(Path(self.MODEL_CACHE_DIR), target_data_dir / "model_cache")
        self._merge_tree(Path(self.TRAINING_OUTPUT_DIR), target_data_dir / "training")

        for legacy_log_dir in legacy_log_dirs:
            if legacy_log_dir.resolve() == target_log_dir.resolve():
                continue
            self._merge_tree(legacy_log_dir, target_log_dir)

    def ensure_dirs(self):
        self.migrate_legacy_storage()
        for d in [
            self.APP_DATA_DIR,
            self.APP_LOG_DIR,
            self.SKILLS_DIR,
            self.MODEL_CACHE_DIR,
            self.TRAINING_OUTPUT_DIR,
            self.MANAGED_RUNTIME_DIR,
            str(Path(self.MILVUS_LITE_PATH).parent),
        ]:
            Path(d).mkdir(parents=True, exist_ok=True)


settings = Settings()
