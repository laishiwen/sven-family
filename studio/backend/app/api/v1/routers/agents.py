from fastapi import APIRouter, Depends, HTTPException
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import Agent
from app.schemas import AgentCreate, AgentUpdate, AgentResponse
from datetime import datetime
import json

router = APIRouter(prefix="/agents", tags=["Agents"])


def _validate_structured_output_payload(enabled: bool, schema_json: str):
    if not enabled:
        return
    try:
        parsed = json.loads(schema_json or "{}")
    except Exception:
        raise HTTPException(422, "structured_output_schema_json 必须是合法 JSON")
    if not isinstance(parsed, dict):
        raise HTTPException(422, "structured_output_schema_json 必须是 JSON 对象")


@router.get("", response_model=list[AgentResponse])
async def list_agents(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Agent))
    return result.all()


@router.post("", response_model=AgentResponse, status_code=201)
async def create_agent(body: AgentCreate, session: AsyncSession = Depends(get_session)):
    _validate_structured_output_payload(
        body.structured_output_enabled,
        body.structured_output_schema_json,
    )
    agent = Agent(**body.model_dump())
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return agent


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: str, session: AsyncSession = Depends(get_session)):
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str, body: AgentUpdate, session: AsyncSession = Depends(get_session)
):
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    next_enabled = (
        body.structured_output_enabled
        if body.structured_output_enabled is not None
        else agent.structured_output_enabled
    )
    next_schema_json = (
        body.structured_output_schema_json
        if body.structured_output_schema_json is not None
        else agent.structured_output_schema_json
    )
    _validate_structured_output_payload(next_enabled, next_schema_json)

    for k, v in body.model_dump(exclude_none=True).items():
        setattr(agent, k, v)
    agent.updated_at = datetime.utcnow()
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(agent_id: str, session: AsyncSession = Depends(get_session)):
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    await session.delete(agent)
    await session.commit()


@router.post("/{agent_id}/test-chat")
async def test_chat(agent_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    """Quick test chat with agent"""
    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return {
        "agent_id": agent_id,
        "message": body.get("message", ""),
        "response": f"[Agent: {agent.name}] Test response for: {body.get('message', '')}",
    }
