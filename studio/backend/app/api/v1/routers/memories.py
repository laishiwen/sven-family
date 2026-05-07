import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy import delete as sqldelete

from app.core.database import get_session
from app.models import Memory, Model, Agent

router = APIRouter(prefix="/memories", tags=["Memories"])


class MemoryResponse(BaseModel):
    id: str
    session_id: str | None
    scope: str
    scope_id: str | None
    key: str
    value: str
    created_at: datetime

    class Config:
        from_attributes = True


class MemoryConfigItem(BaseModel):
    id: str
    name: str
    memory_enabled: bool


class MemoryConfigResponse(BaseModel):
    models: list[MemoryConfigItem]
    agents: list[MemoryConfigItem]
    global_enabled: bool


# In-memory global toggle (resets on restart, mirrors runtime behavior).
_global_memory_enabled = False


@router.get("/config", response_model=MemoryConfigResponse)
async def get_memory_config(session: AsyncSession = Depends(get_session)):
    models_result = await session.exec(select(Model))
    agents_result = await session.exec(select(Agent))

    return MemoryConfigResponse(
        global_enabled=_global_memory_enabled,
        models=[
            MemoryConfigItem(id=m.id, name=m.name, memory_enabled=m.memory_enabled)
            for m in models_result.all()
        ],
        agents=[
            MemoryConfigItem(id=a.id, name=a.name, memory_enabled=a.memory_enabled)
            for a in agents_result.all()
        ],
    )


class ToggleGlobalBody(BaseModel):
    enabled: bool


@router.post("/config/global")
async def toggle_global_memory(body: ToggleGlobalBody):
    global _global_memory_enabled
    _global_memory_enabled = body.enabled
    return {"global_enabled": _global_memory_enabled}


class ToggleItemBody(BaseModel):
    enabled: bool


class MemoryUpdateBody(BaseModel):
    value: str


@router.post("/config/models/{model_id}")
async def toggle_model_memory(
    model_id: str, body: ToggleItemBody, session: AsyncSession = Depends(get_session)
):
    model = await session.get(Model, model_id)
    if not model:
        raise HTTPException(404, "Model not found")
    model.memory_enabled = body.enabled
    model.updated_at = datetime.utcnow()
    session.add(model)
    await session.commit()
    return {"id": model_id, "memory_enabled": body.enabled}


@router.post("/config/agents/{agent_id}")
async def toggle_agent_memory(
    agent_id: str, body: ToggleItemBody, session: AsyncSession = Depends(get_session)
):
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    agent.memory_enabled = body.enabled
    agent.updated_at = datetime.utcnow()
    session.add(agent)
    await session.commit()
    return {"id": agent_id, "memory_enabled": body.enabled}


class MemoryCreateBody(BaseModel):
    key: str
    value: str
    session_id: str | None = None
    scope: str = "agent"
    scope_id: str | None = None


@router.post("", response_model=MemoryResponse, status_code=201)
async def create_memory(
    body: MemoryCreateBody, session: AsyncSession = Depends(get_session)
):
    from app.models import Memory as MemoryModel
    memory = MemoryModel(
        key=body.key.strip(),
        value=body.value.strip(),
        session_id=body.session_id,
        scope=body.scope,
        scope_id=body.scope_id,
    )
    session.add(memory)
    await session.commit()
    await session.refresh(memory)
    return memory


@router.get("", response_model=list[MemoryResponse])
async def list_memories(
    session_id: str | None = Query(default=None),
    scope: str | None = Query(default=None),
    scope_id: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    stmt = select(Memory)
    if session_id:
        stmt = stmt.where(Memory.session_id == session_id)
    if scope:
        stmt = stmt.where(Memory.scope == scope)
    if scope_id:
        stmt = stmt.where(Memory.scope_id == scope_id)
    stmt = stmt.order_by(Memory.created_at.desc()).limit(50)
    result = await session.exec(stmt)
    return result.all()


@router.put("/{memory_id}", response_model=MemoryResponse)
async def update_memory(
    memory_id: str, body: MemoryUpdateBody, session: AsyncSession = Depends(get_session)
):
    memory = await session.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "Memory not found")
    memory.value = body.value
    session.add(memory)
    await session.commit()
    await session.refresh(memory)
    return memory


@router.patch("/{memory_id}", response_model=MemoryResponse)
async def patch_memory(
    memory_id: str, body: MemoryUpdateBody, session: AsyncSession = Depends(get_session)
):
    return await update_memory(memory_id, body, session)


@router.delete("/{memory_id}", status_code=204)
async def delete_memory(memory_id: str, session: AsyncSession = Depends(get_session)):
    memory = await session.get(Memory, memory_id)
    if not memory:
        raise HTTPException(404, "Memory not found")
    await session.delete(memory)
    await session.commit()


@router.delete("/session/{session_id}", status_code=204)
async def clear_session_memories(
    session_id: str, session: AsyncSession = Depends(get_session)
):
    await session.exec(sqldelete(Memory).where(Memory.session_id == session_id))
    await session.commit()
