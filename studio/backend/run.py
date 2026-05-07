#!/usr/bin/env python3
"""
Entry point for Sven Studio API server.
Run with: python apps/api/run.py  (from repo root)
Or: cd apps/api && python run.py
"""
import sys
import os
from pathlib import Path

# Ensure apps/api is on sys.path regardless of CWD
THIS_DIR = Path(__file__).resolve().parent
THIS_DIR_STR = str(THIS_DIR)
if THIS_DIR_STR not in sys.path:
    sys.path.insert(0, THIS_DIR_STR)

import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    # Uvicorn reload patterns must be relative glob patterns.
    # Using absolute paths raises NotImplementedError on Python 3.13 pathlib glob.
    managed_runtime_path = Path(settings.MANAGED_RUNTIME_DIR)
    try:
        managed_runtime_pattern = f"{managed_runtime_path.relative_to(THIS_DIR).as_posix()}/**"
    except ValueError:
        managed_runtime_pattern = "data/managed_runtime/**"

    uvicorn.run(
        "app.main:app",
        host=settings.APP_HOST,
        port=settings.APP_PORT,
        reload=settings.APP_ENV == "development",
        reload_dirs=[THIS_DIR_STR],
        reload_excludes=[managed_runtime_pattern],
        log_level=settings.APP_LOG_LEVEL,
    )
