from fastapi import APIRouter
from app.api.v1 import auth, dashboard, memberships, orders, community, crawler, analytics, settings, site_analytics

router = APIRouter()
router.include_router(auth.router, prefix="/auth", tags=["Auth"])
router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
router.include_router(memberships.router, prefix="/memberships", tags=["Memberships"])
router.include_router(orders.router, prefix="/orders", tags=["Orders"])
router.include_router(community.router, prefix="/community", tags=["Community"])
router.include_router(crawler.router, prefix="/crawler", tags=["Crawler"])
router.include_router(analytics.router, prefix="/analytics", tags=["Analytics"])
router.include_router(site_analytics.router, prefix="/site-stats", tags=["Site Analytics"])
router.include_router(settings.router, prefix="/settings", tags=["Settings"])
