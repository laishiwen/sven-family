#!/usr/bin/env python3
import uvicorn
import os
from config import settings

if __name__ == "__main__":
    uvicorn.run(
        "server:app",
        host=settings.app_host,
        port=settings.app_port,
        reload=os.getenv("APP_RELOAD", "false").lower() == "true",
    )
