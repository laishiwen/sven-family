from __future__ import annotations

import asyncio
import json
import os
from contextlib import AsyncExitStack
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, TYPE_CHECKING

from fastapi import HTTPException

from app.core.config import settings
from app.models import MCPServer
from app.services.runtime_bootstrap import ensure_node_runtime

if TYPE_CHECKING:
    from mcp import ClientSession


@dataclass
class ResolvedStdioCommand:
    command: str
    args: list[str]
    env: dict[str, str]


@dataclass
class MCPProbeResult:
    transport: str
    capabilities: list[dict[str, Any]]
    resolved_command: str | None = None
    resolved_args: list[str] | None = None


@dataclass
class MCPExecutionResult:
    server_name: str
    operation: str
    target: str
    payload: dict[str, Any]


def _load_mcp_sdk() -> tuple[Any, Any, Any, Any, Any]:
    try:
        from mcp import ClientSession, StdioServerParameters
        from mcp.client.sse import sse_client
        from mcp.client.stdio import stdio_client
        from mcp.client.streamable_http import streamablehttp_client
    except ModuleNotFoundError as exc:
        raise HTTPException(
            503,
            "MCP Python SDK is not installed in the current backend environment. Install the 'mcp' package to enable MCP connection testing.",
        ) from exc

    return ClientSession, StdioServerParameters, sse_client, stdio_client, streamablehttp_client


def _parse_args(raw: str) -> list[str]:
    try:
        value = json.loads(raw or "[]")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Invalid args_json: {exc}") from exc

    if not isinstance(value, list):
        raise HTTPException(400, "args_json must decode to a JSON array")

    return [str(item) for item in value]


def _parse_env(raw: str) -> dict[str, str]:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise HTTPException(400, f"Invalid env_json: {exc}") from exc

    if not isinstance(value, dict):
        raise HTTPException(400, "env_json must decode to a JSON object")

    return {str(key): str(item) for key, item in value.items() if item is not None}


def _normalize_transport(transport: str | None) -> str:
    return (transport or "stdio").strip().lower()


def _format_resource(resource: Any) -> dict[str, Any]:
    return {
        "type": "resource",
        "name": getattr(resource, "name", None),
        "uri": str(getattr(resource, "uri", "")) or None,
        "description": getattr(resource, "description", None),
    }


def _format_prompt(prompt: Any) -> dict[str, Any]:
    return {
        "type": "prompt",
        "name": getattr(prompt, "name", None),
        "description": getattr(prompt, "description", None),
    }


def _format_tool(tool: Any) -> dict[str, Any]:
    return {
        "type": "tool",
        "name": getattr(tool, "name", None),
        "description": getattr(tool, "description", None),
        "input_schema": getattr(tool, "inputSchema", None),
    }


def _translate_npx_args(args: list[str]) -> list[str]:
    translated: list[str] = []
    for arg in args:
        if arg == "-y":
            translated.append("--yes")
        elif arg == "--no-install":
            translated.append("--no")
        else:
            translated.append(arg)
    return translated


async def _resolve_stdio_command(server: MCPServer) -> ResolvedStdioCommand:
    command = (server.command or "").strip()
    if not command:
        raise HTTPException(400, "Command is required for stdio MCP servers")

    args = _parse_args(server.args_json)
    env = {**os.environ, **_parse_env(server.env_json)}

    if os.path.isabs(command):
        return ResolvedStdioCommand(command=command, args=args, env=env)

    lower = command.lower()
    if lower in {"node", "node.exe"}:
        node_executable, _ = await ensure_node_runtime()
        return ResolvedStdioCommand(command=str(node_executable), args=args, env=env)

    if lower in {"npm", "npm.cmd"}:
        node_executable, npm_cli = await ensure_node_runtime()
        return ResolvedStdioCommand(
            command=str(node_executable),
            args=[str(npm_cli), *args],
            env=env,
        )

    if lower in {"npx", "npx.cmd"}:
        node_executable, npm_cli = await ensure_node_runtime()
        npx_cli = npm_cli.with_name("npx-cli.js")
        if npx_cli.exists():
            return ResolvedStdioCommand(
                command=str(node_executable),
                args=[str(npx_cli), *args],
                env=env,
            )

        return ResolvedStdioCommand(
            command=str(node_executable),
            args=[str(npm_cli), "exec", *_translate_npx_args(args)],
            env=env,
        )

    if lower in {"pnpm", "pnpm.cmd"}:
        raise HTTPException(501, "pnpm-based MCP servers are not supported by the managed runtime yet")

    return ResolvedStdioCommand(command=command, args=args, env=env)


async def _collect_capabilities(session: "ClientSession") -> list[dict[str, Any]]:
    capabilities: list[dict[str, Any]] = []

    try:
        tools = await session.list_tools()
        capabilities.extend(_format_tool(tool) for tool in tools.tools)
    except Exception:
        pass

    try:
        prompts = await session.list_prompts()
        capabilities.extend(_format_prompt(prompt) for prompt in prompts.prompts)
    except Exception:
        pass

    try:
        resources = await session.list_resources()
        capabilities.extend(_format_resource(resource) for resource in resources.resources)
    except Exception:
        pass

    return capabilities


async def _probe_stdio(server: MCPServer) -> MCPProbeResult:
    ClientSession, StdioServerParameters, _, stdio_client, _ = _load_mcp_sdk()
    resolved = await _resolve_stdio_command(server)
    server_params = StdioServerParameters(
        command=resolved.command,
        args=resolved.args,
        env=resolved.env,
    )

    async with AsyncExitStack() as stack:
        result = await stack.enter_async_context(stdio_client(server_params))
        if len(result) == 2:
            read_stream, write_stream = result
        elif len(result) == 3:
            read_stream, write_stream, _ = result
        else:
            raise HTTPException(500, f"Unexpected stdio_client result: {result}")

        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        capabilities = await _collect_capabilities(session)

    return MCPProbeResult(
        transport="stdio",
        capabilities=capabilities,
        resolved_command=resolved.command,
        resolved_args=resolved.args,
    )


async def _probe_streamable_http(server: MCPServer) -> MCPProbeResult:
    if not server.url:
        raise HTTPException(400, "URL is required for HTTP MCP servers")

    ClientSession, _, _, _, streamablehttp_client = _load_mcp_sdk()

    async with AsyncExitStack() as stack:
        result = await stack.enter_async_context(streamablehttp_client(url=server.url))
        if len(result) == 2:
            read_stream, write_stream = result
        elif len(result) == 3:
            read_stream, write_stream, _ = result
        else:
            raise HTTPException(500, f"Unexpected streamablehttp_client result: {result}")

        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        capabilities = await _collect_capabilities(session)

    return MCPProbeResult(transport="http", capabilities=capabilities)


async def _probe_sse(server: MCPServer) -> MCPProbeResult:
    if not server.url:
        raise HTTPException(400, "URL is required for SSE MCP servers")

    ClientSession, _, sse_client, _, _ = _load_mcp_sdk()

    async with AsyncExitStack() as stack:
        result = await stack.enter_async_context(sse_client(url=server.url))
        if len(result) == 2:
            read_stream, write_stream = result
        elif len(result) == 3:
            read_stream, write_stream, _ = result
        else:
            raise HTTPException(500, f"Unexpected sse_client result: {result}")

        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        capabilities = await _collect_capabilities(session)

    return MCPProbeResult(transport="sse", capabilities=capabilities)


async def probe_mcp_server(server: MCPServer) -> MCPProbeResult:
    transport = _normalize_transport(server.transport)

    try:
        return await asyncio.wait_for(_probe_by_transport(server, transport), settings.MANAGED_RUNTIME_TIMEOUT_SEC)
    except asyncio.TimeoutError as exc:
        raise HTTPException(504, f"Timed out while testing MCP server '{server.name}'") from exc


async def _probe_by_transport(server: MCPServer, transport: str) -> MCPProbeResult:
    if transport == "stdio":
        return await _probe_stdio(server)
    if transport == "http":
        return await _probe_streamable_http(server)
    if transport == "sse":
        return await _probe_sse(server)

    raise HTTPException(400, f"Unsupported MCP transport: {server.transport}")


@asynccontextmanager
async def open_mcp_client(server: MCPServer):
    transport = _normalize_transport(server.transport)
    ClientSession, StdioServerParameters, sse_client, stdio_client, streamablehttp_client = _load_mcp_sdk()

    async with AsyncExitStack() as stack:
        if transport == "stdio":
            resolved = await _resolve_stdio_command(server)
            server_params = StdioServerParameters(
                command=resolved.command,
                args=resolved.args,
                env=resolved.env,
            )
            result = await stack.enter_async_context(stdio_client(server_params))
        elif transport == "http":
            if not server.url:
                raise HTTPException(400, "URL is required for HTTP MCP servers")
            result = await stack.enter_async_context(streamablehttp_client(url=server.url))
        elif transport == "sse":
            if not server.url:
                raise HTTPException(400, "URL is required for SSE MCP servers")
            result = await stack.enter_async_context(sse_client(url=server.url))
        else:
            raise HTTPException(400, f"Unsupported MCP transport: {server.transport}")

        if len(result) == 2:
            read_stream, write_stream = result
        elif len(result) == 3:
            read_stream, write_stream, _ = result
        else:
            raise HTTPException(500, f"Unexpected MCP client result: {result}")

        session = await stack.enter_async_context(ClientSession(read_stream, write_stream))
        await session.initialize()
        yield session


def _serialize_mcp_result(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        return [_serialize_mcp_result(item) for item in value]
    if isinstance(value, dict):
        return {str(key): _serialize_mcp_result(item) for key, item in value.items()}
    model_dump = getattr(value, "model_dump", None)
    if callable(model_dump):
        return _serialize_mcp_result(model_dump())
    if hasattr(value, "__dict__"):
        return {
            key: _serialize_mcp_result(item)
            for key, item in vars(value).items()
            if not key.startswith("_")
        }
    return str(value)


async def execute_mcp_tool(server: MCPServer, tool_name: str, arguments: dict[str, Any] | None = None) -> MCPExecutionResult:
    async with open_mcp_client(server) as session:
        result = await session.call_tool(tool_name, arguments or {})
    return MCPExecutionResult(
        server_name=server.name,
        operation="tool",
        target=tool_name,
        payload=_serialize_mcp_result(result),
    )


async def execute_mcp_prompt(server: MCPServer, prompt_name: str, arguments: dict[str, str] | None = None) -> MCPExecutionResult:
    async with open_mcp_client(server) as session:
        result = await session.get_prompt(prompt_name, arguments or {})
    return MCPExecutionResult(
        server_name=server.name,
        operation="prompt",
        target=prompt_name,
        payload=_serialize_mcp_result(result),
    )


async def execute_mcp_resource(server: MCPServer, resource_uri: str) -> MCPExecutionResult:
    from pydantic import AnyUrl, TypeAdapter

    uri = TypeAdapter(AnyUrl).validate_python(resource_uri)
    async with open_mcp_client(server) as session:
        result = await session.read_resource(uri)
    return MCPExecutionResult(
        server_name=server.name,
        operation="resource",
        target=resource_uri,
        payload=_serialize_mcp_result(result),
    )