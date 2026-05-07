from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from app.core.config import settings
from app.core.database import init_db
from app.api.v1 import api_router
from app.services.rag_jobs import resume_pending_rag_jobs
import logging

logging.basicConfig(
    level=getattr(logging, settings.APP_LOG_LEVEL.upper()),
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Sven Studio API starting up...")
    settings.ensure_dirs()
    await init_db()
    await resume_pending_rag_jobs()
    logger.info(f"Server ready at http://{settings.APP_HOST}:{settings.APP_PORT}")
    yield
    # Shutdown
    logger.info("Sven Studio API shut down.")


app = FastAPI(
    title="Sven Studio API",
    description="本地优先 AI Agent 开发平台",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.middleware("http")
async def desktop_only_guard(request: Request, call_next):
    """In production, reject requests that don't come from the Electron desktop app."""
    if settings.APP_ENV != "development":
        if request.headers.get("X-Sven-Desktop") != "1":
            return JSONResponse(
                status_code=403,
                content={"detail": "This application is only accessible via Sven Studio desktop app."},
            )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

web_dist_dir = settings.web_dist_dir
web_index = web_dist_dir / "index.html"
has_web_dist = web_index.exists()

if has_web_dist and (web_dist_dir / "assets").exists():
    app.mount(
        "/assets",
        StaticFiles(directory=str(web_dist_dir / "assets")),
        name="web-assets",
    )


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0", "env": settings.APP_ENV}


@app.get("/")
async def root():
    if has_web_dist:
        return FileResponse(web_index)
    return {
        "name": "Sven Studio API",
        "docs": "/docs",
        "health": "/health",
    }


if has_web_dist:
    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        requested = web_dist_dir / full_path
        if requested.is_file():
            return FileResponse(requested)
        return FileResponse(web_index)
