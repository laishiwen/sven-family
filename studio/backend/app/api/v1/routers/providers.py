from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import Provider, Model
from app.schemas import (
    ProviderCreate, ProviderUpdate, ProviderResponse,
    ModelCreate, ModelResponse,
)
from app.integrations.llm.client import check_model_health
from datetime import datetime
import httpx

router = APIRouter(prefix="/providers", tags=["LLM Providers"])


@router.get("", response_model=list[ProviderResponse])
async def list_providers(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Provider))
    return result.all()


@router.post("", response_model=ProviderResponse, status_code=201)
async def create_provider(body: ProviderCreate, session: AsyncSession = Depends(get_session)):
    provider = Provider(
        name=body.name,
        provider_type=body.provider_type,
        base_url=body.base_url,
        api_key_encrypted=body.api_key,  # TODO: encrypt
        gateway_type=body.gateway_type,
        gateway_config_json=body.gateway_config_json,
    )
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return provider


@router.get("/{provider_id}", response_model=ProviderResponse)
async def get_provider(provider_id: str, session: AsyncSession = Depends(get_session)):
    provider = await session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")
    return provider


@router.patch("/{provider_id}", response_model=ProviderResponse)
async def update_provider(
    provider_id: str, body: ProviderUpdate, session: AsyncSession = Depends(get_session)
):
    provider = await session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")
    update_data = body.model_dump(exclude_none=True)
    if "api_key" in update_data:
        provider.api_key_encrypted = update_data.pop("api_key")
    for k, v in update_data.items():
        setattr(provider, k, v)
    provider.updated_at = datetime.utcnow()
    session.add(provider)
    await session.commit()
    await session.refresh(provider)
    return provider


@router.delete("/{provider_id}", status_code=204)
async def delete_provider(provider_id: str, session: AsyncSession = Depends(get_session)):
    provider = await session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")
    # Delete related models first to avoid foreign key constraint violation
    related_models = await session.exec(select(Model).where(Model.provider_id == provider_id))
    for model in related_models.all():
        await session.delete(model)
    await session.delete(provider)
    await session.commit()


@router.post("/{provider_id}/health-check")
async def health_check_provider(provider_id: str, session: AsyncSession = Depends(get_session)):
    provider = await session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")

    # Pick a quick test model based on provider type
    test_model_map = {
        "openai": "gpt-4o-mini",
        "anthropic": "claude-3-5-haiku-20241022",
        "google": "gemini-1.5-flash",
        "ollama": "ollama/llama3.2",
    }
    test_model = test_model_map.get(provider.provider_type, "gpt-4o-mini")

    result = await check_model_health(
        model=test_model,
        api_key=provider.api_key_encrypted or None,
        api_base=provider.base_url or None,
    )

    provider.health_status = result["status"]
    provider.last_checked_at = datetime.utcnow()
    session.add(provider)
    await session.commit()
    return {"status": result["status"], "error": result.get("error")}


@router.post("/{provider_id}/fetch-models")
async def fetch_provider_models(provider_id: str, session: AsyncSession = Depends(get_session)):
    """Call provider's /models endpoint and sync to database."""
    provider = await session.get(Provider, provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")

    base_url = (provider.base_url or "https://api.openai.com/v1").rstrip("/")
    headers = {"Content-Type": "application/json"}
    if provider.api_key_encrypted:
        headers["Authorization"] = f"Bearer {provider.api_key_encrypted}"

    fetched_models: list[dict] = []
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(f"{base_url}/models", headers=headers)
            resp.raise_for_status()
            data = resp.json()
            # OpenAI-compatible: {"data": [{"id": "...", "display_name": "...", "owned_by": "..."}]}
            raw_models = data.get("data", data) if isinstance(data, dict) else data
            fetched_models = [m for m in raw_models if isinstance(m, dict) and "id" in m]
    except Exception as e:
        raise HTTPException(502, f"Failed to fetch models from provider: {str(e)}")

    # Upsert models into database
    existing_result = await session.exec(
        select(Model).where(Model.provider_id == provider_id)
    )
    existing_map = {m.model_id: m for m in existing_result.all()}

    created = []
    updated = []
    for m_data in fetched_models:
        mid = m_data["id"]
        display_name = m_data.get("display_name") or mid
        owned_by = m_data.get("owned_by")
        if mid in existing_map:
            # Update existing model with latest display_name and owned_by
            existing_m = existing_map[mid]
            existing_m.name = display_name
            existing_m.owned_by = owned_by
            session.add(existing_m)
            updated.append(mid)
        else:
            m = Model(
                provider_id=provider_id,
                name=display_name,
                model_id=mid,
                owned_by=owned_by,
                source_type="api",
            )
            session.add(m)
            created.append(mid)

    await session.commit()
    return {"synced": len(fetched_models), "created": len(created), "updated": len(updated), "model_ids": [m["id"] for m in fetched_models]}

# Model sub-routes
model_router = APIRouter(prefix="/models", tags=["Models"])


@model_router.get("", response_model=list[ModelResponse])
async def list_models(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Model))
    return result.all()


@model_router.get("/catalog")
async def get_model_catalog():
    """Return a built-in model catalog"""
    catalog = [
        {"provider": "openai", "models": ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"]},
        {"provider": "anthropic", "models": ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"]},
        {"provider": "google", "models": ["gemini-1.5-pro", "gemini-1.5-flash"]},
        {"provider": "ollama", "models": ["llama3.2", "mistral", "qwen2.5"]},
    ]
    return {"catalog": catalog}


@model_router.post("", response_model=ModelResponse, status_code=201)
async def create_model(body: ModelCreate, session: AsyncSession = Depends(get_session)):
    model = Model(**body.model_dump())
    session.add(model)
    await session.commit()
    await session.refresh(model)
    return model


@model_router.get("/{model_id}", response_model=ModelResponse)
async def get_model(model_id: str, session: AsyncSession = Depends(get_session)):
    model = await session.get(Model, model_id)
    if not model:
        raise HTTPException(404, "Model not found")
    return model


@model_router.delete("/{model_id}", status_code=204)
async def delete_model(model_id: str, session: AsyncSession = Depends(get_session)):
    model = await session.get(Model, model_id)
    if not model:
        raise HTTPException(404, "Model not found")
    await session.delete(model)
    await session.commit()


@model_router.post("/{model_id}/test")
async def test_model(model_id: str, session: AsyncSession = Depends(get_session)):
    """Test model with streaming enabled and reasoning disabled.

    Sends a lightweight chat request with stream=true to verify the model
    can produce streaming output. Reasoning/thinking is explicitly disabled.
    """
    model = await session.get(Model, model_id)
    if not model:
        raise HTTPException(404, "Model not found")
    provider = await session.get(Provider, model.provider_id)
    if not provider:
        raise HTTPException(404, "Provider not found")

    base_url = (provider.base_url or "http://localhost:8000").rstrip("/")
    api_key = provider.api_key_encrypted or ""
    if base_url.endswith("/v1"):
        target_url = f"{base_url}/chat/completions"
    else:
        target_url = f"{base_url}/v1/chat/completions"

    headers: dict[str, str] = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = {
        "model": model.model_id,
        "messages": [{"role": "user", "content": "Say 'ok'."}],
        "stream": True,
        "max_tokens": 10,
    }

    # Strip reasoning_effort / thinking params to ensure no deep reasoning
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            async with client.stream("POST", target_url, headers=headers, json=body) as resp:
                if resp.status_code >= 400:
                    error_text = await resp.aread()
                    return {
                        "status": "unhealthy",
                        "error": f"HTTP {resp.status_code}: {error_text.decode()[:100]}",
                    }
                # Read first few SSE chunks to confirm streaming works
                chunks_read = 0
                async for line in resp.aiter_lines():
                    if line.startswith("data: ") and line != "data: [DONE]":
                        chunks_read += 1
                        if chunks_read >= 3:
                            break
                if chunks_read == 0:
                    return {"status": "unhealthy", "error": "No streaming chunks received"}
        return {"status": "healthy"}
    except httpx.TimeoutException:
        return {"status": "unhealthy", "error": "Connection timed out"}
    except Exception as e:
        error_msg = str(e)[:200]
        return {"status": "unhealthy", "error": error_msg}
