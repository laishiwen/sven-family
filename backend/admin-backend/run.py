import os
import uvicorn

if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("API_PORT", "8001")),
        reload=os.getenv("API_RELOAD", "false").lower() == "true",
    )
