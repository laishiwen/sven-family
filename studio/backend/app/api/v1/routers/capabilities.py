from fastapi import APIRouter, Depends
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.schemas import CapabilityRegistryResponse
from app.services.capabilities import build_capability_registry, build_provider_capabilities

router = APIRouter(prefix="/capabilities", tags=["Capabilities"])


@router.get("", response_model=CapabilityRegistryResponse)
async def get_capability_registry(session: AsyncSession = Depends(get_session)):
    return await build_capability_registry(session)


@router.get("/providers/{provider_type}")
async def get_provider_capability_registry(
    provider_type: str,
    session: AsyncSession = Depends(get_session),
):
    return await build_provider_capabilities(session, provider_type)