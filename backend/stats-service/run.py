#!/usr/bin/env python3
import uvicorn
import os

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8002")),
        reload=os.getenv("API_RELOAD", "false").lower() == "true",
    )
