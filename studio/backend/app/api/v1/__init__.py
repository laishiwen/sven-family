from fastapi import APIRouter
from app.api.v1.routers.providers import router as providers_router, model_router
from app.api.v1.routers.agents import router as agents_router
from app.api.v1.routers.chat import router as chat_router
from app.api.v1.routers.tools import tool_router, skill_router
from app.api.v1.routers.mcp import router as mcp_router
from app.api.v1.routers.rag import router as rag_router
from app.api.v1.routers.observability import router as obs_router
from app.api.v1.routers.finetune import dataset_router, finetune_router
from app.api.v1.routers.dashboard import router as dashboard_router
from app.api.v1.routers.capabilities import router as capabilities_router
from app.api.v1.routers.store_settings import store_router, settings_router
from app.api.v1.routers.prompts import router as prompts_router
from app.api.v1.routers.speech import router as speech_router
from app.api.v1.routers.channels import router as channels_router
from app.api.v1.routers.memories import router as memories_router

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(dashboard_router)
api_router.include_router(capabilities_router)
api_router.include_router(providers_router)
api_router.include_router(model_router)
api_router.include_router(agents_router)
api_router.include_router(chat_router)
api_router.include_router(tool_router)
api_router.include_router(skill_router)
api_router.include_router(prompts_router)
api_router.include_router(mcp_router)
api_router.include_router(rag_router)
api_router.include_router(obs_router)
api_router.include_router(dataset_router)
api_router.include_router(finetune_router)
api_router.include_router(store_router)
api_router.include_router(settings_router)
api_router.include_router(speech_router)
api_router.include_router(channels_router)
api_router.include_router(memories_router)
