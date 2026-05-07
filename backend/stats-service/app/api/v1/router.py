from fastapi import APIRouter
from app.api.v1.routes.track import router as track_router
from app.api.v1.routes.query import router as query_router

router = APIRouter()
router.include_router(track_router)
router.include_router(query_router)

__all__ = ["router"]
