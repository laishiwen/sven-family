import json
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models import Agent, MCPServer
from app.schemas import MCPServerCreate, MCPServerResponse, MCPServerUpdate
from app.services.mcp_executor import probe_mcp_server
from app.services.runtime_bootstrap import ensure_mcp_cli, get_managed_runtime_status

router = APIRouter(prefix="/mcp", tags=["MCP Servers"])


async def _cleanup_agent_mcp_references(
    session: AsyncSession, server_id: str
) -> None:
    agents = (await session.exec(select(Agent))).all()
    changed = False
    for agent in agents:
        raw = agent.mcp_server_ids_json or "[]"
        try:
            ids = json.loads(raw)
        except Exception:
            ids = []
        if not isinstance(ids, list):
            ids = []
        normalized_ids = [str(item) for item in ids if str(item) != server_id]
        if normalized_ids != [str(item) for item in ids]:
            agent.mcp_server_ids_json = json.dumps(normalized_ids, ensure_ascii=False)
            agent.updated_at = datetime.utcnow()
            session.add(agent)
            changed = True
    if changed:
        await session.commit()


@router.get("/runtime/status")
async def runtime_status():
    return await get_managed_runtime_status()


@router.post("/runtime/ensure")
async def ensure_runtime():
    cli = await ensure_mcp_cli()
    return {
        "status": "ready",
        "package": cli.package_name,
        "package_dir": str(cli.package_dir),
        "node_path": str(cli.node_executable),
        "entry": str(cli.bin_script),
    }


@router.get("/servers", response_model=list[MCPServerResponse])
async def list_mcp_servers(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(MCPServer))
    return result.all()


@router.post("/servers", response_model=MCPServerResponse, status_code=201)
async def create_mcp_server(body: MCPServerCreate, session: AsyncSession = Depends(get_session)):
    server = MCPServer(**body.model_dump())
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return server


@router.get("/servers/{server_id}", response_model=MCPServerResponse)
async def get_mcp_server(server_id: str, session: AsyncSession = Depends(get_session)):
    server = await session.get(MCPServer, server_id)
    if not server:
        raise HTTPException(404, "MCP Server not found")
    return server


@router.patch("/servers/{server_id}", response_model=MCPServerResponse)
async def update_mcp_server(
    server_id: str, body: MCPServerUpdate, session: AsyncSession = Depends(get_session)
):
    server = await session.get(MCPServer, server_id)
    if not server:
        raise HTTPException(404, "MCP Server not found")
    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(server, k, v)
    server.updated_at = datetime.utcnow()
    session.add(server)
    await session.commit()
    await session.refresh(server)
    return server


@router.delete("/servers/{server_id}", status_code=204)
async def delete_mcp_server(server_id: str, session: AsyncSession = Depends(get_session)):
    server = await session.get(MCPServer, server_id)
    if not server:
        raise HTTPException(404, "MCP Server not found")
    if server.is_builtin:
        raise HTTPException(403, "Built-in MCP servers cannot be deleted")
    await _cleanup_agent_mcp_references(session, server_id)
    await session.delete(server)
    await session.commit()


@router.post("/servers/{server_id}/test-connection")
async def test_connection(server_id: str, session: AsyncSession = Depends(get_session)):
    server = await session.get(MCPServer, server_id)
    if not server:
        raise HTTPException(404, "MCP Server not found")

    status = "healthy"
    error = None
    capabilities = []
    resolved_command = None
    resolved_args = None

    try:
        probe = await probe_mcp_server(server)
        capabilities = probe.capabilities
        resolved_command = probe.resolved_command
        resolved_args = probe.resolved_args
    except HTTPException as exc:
        status = "unhealthy"
        error = str(exc.detail)
    except Exception as exc:
        status = "unhealthy"
        error = str(exc)

    server.health_status = status
    server.last_checked_at = datetime.utcnow()
    server.capabilities_json = json.dumps(capabilities)
    session.add(server)
    await session.commit()

    return {
        "status": status,
        "capabilities": capabilities,
        "error": error,
        "resolved_command": resolved_command,
        "resolved_args": resolved_args,
    }
