from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from fastapi import HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.integrations.llm.client import llm_complete_text
from app.models import (
    Agent,
    ChatMessage,
    ChatSession,
    MCPServer,
    Memory,
    Model,
    Prompt,
    Provider,
    Run,
    RunStep,
    Skill,
    Tool,
)
from app.services.tool_runtime import execute_tool
from app.services.mcp_executor import (
    execute_mcp_prompt,
    execute_mcp_resource,
    execute_mcp_tool,
)
from app.services.observability import record_step
from pathlib import Path

# Safe default working directory when agent doesn't specify one.
# Uses the repo root (studio/) — not os.getcwd() which could be anything.
_AGENT_DEFAULT_CWD = str(Path(__file__).resolve().parent.parent.parent.parent)

try:
    from app.integrations.llamaindex.retriever import query_kb
except ImportError:
    query_kb = None

try:
    from app.services.web_search import search_web
except ImportError:
    search_web = None

logger = logging.getLogger(__name__)

# ── Session config cache ─────────────────────────────────────────────────────

_CACHE_TTL = 300  # 5 minutes

@dataclass
class _CachedAgentConfig:
    agent: Agent
    tools: list[Tool] = field(default_factory=list)
    skills: list[Skill] = field(default_factory=list)
    prompts: list[Prompt] = field(default_factory=list)
    mcp_servers: list[MCPServer] = field(default_factory=list)
    cached_at: float = 0.0

    def is_valid(self) -> bool:
        return time.time() - self.cached_at < _CACHE_TTL

_session_config_cache: dict[str, _CachedAgentConfig] = {}


async def _get_cached_agent_config(
    session: AsyncSession, agent_id: str
) -> _CachedAgentConfig:
    """Return cached agent config or load + cache it."""
    cache_key = agent_id
    cached = _session_config_cache.get(cache_key)
    if cached and cached.is_valid():
        return cached

    agent = await session.get(Agent, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    cfg = _CachedAgentConfig(agent=agent, cached_at=time.time())

    # Load tools
    for tid in _parse_json_array(agent.tool_ids_json):
        t = await session.get(Tool, tid)
        if t and t.enabled:
            cfg.tools.append(t)

    # Load skills
    for sid in _parse_json_array(agent.skill_ids_json):
        s = await session.get(Skill, sid)
        if s and s.enabled:
            cfg.skills.append(s)

    # Load prompts
    for pid in _parse_json_array(agent.prompt_ids_json):
        p = await session.get(Prompt, pid)
        if p and p.enabled:
            cfg.prompts.append(p)

    # Load MCP servers
    for mid in _parse_json_array(agent.mcp_server_ids_json):
        m = await session.get(MCPServer, mid)
        if m and m.enabled:
            cfg.mcp_servers.append(m)

    _session_config_cache[cache_key] = cfg
    return cfg


def invalidate_agent_config_cache(agent_id: str):
    """Call after agent/tool/skill/prompt/MCP updates."""
    _session_config_cache.pop(agent_id, None)


# ── Dataclasses ──────────────────────────────────────────────────────────────

@dataclass
class AgentPreparedRequest:
    messages: list[dict[str, Any]]
    model_id_str: str
    provider_api_key: str | None
    provider_api_base: str | None
    provider_type: str | None
    step_index: int
    model_call_options: dict[str, Any]
    # HITL approval signal — set when agent requires human approval before executing
    approval_required: dict[str, Any] | None = None
    # Tool calls that were executed during this request (for UI indicators)
    tool_calls: list[dict[str, Any]] | None = None


@dataclass
class AgentAction:
    action: str
    target: str
    arguments: dict[str, Any]
    server_name: str = ""
    sub_agent_id: str = ""  # set when action delegates to a subagent
    depth: int = 0  # current recursion depth for subagent calls


class HitlApprovalRequired(Exception):
    """Raised inside agent runtime when HITL is enabled and an action needs approval."""

    def __init__(self, run_id: str, action: AgentAction, action_label: str):
        self.run_id = run_id
        self.action = action
        self.action_label = action_label
        super().__init__(f"HITL approval required for action: {action.action}/{action.target}")


async def prepare_agent_request(
    session: AsyncSession,
    chat_session: ChatSession,
    body: Any,
    run: Run,
    think_enabled: bool,
) -> AgentPreparedRequest:
    if not chat_session.agent_id:
        raise HTTPException(400, "Agent session requires agent_id")

    cfg = await _get_cached_agent_config(session, chat_session.agent_id)
    agent = cfg.agent

    history = await _load_history(session, chat_session.id)
    messages = [{"role": msg.role, "content": msg.content} for msg in history]

    model_id_str, provider_api_key, provider_api_base, provider_type = await _resolve_model_creds(
        session,
        agent.model_id or chat_session.model_id,
    )
    model_call_options: dict[str, Any] = {
        "temperature": agent.temperature,
        "max_tokens": agent.max_tokens,
    }
    step_index = 0
    system_parts: list[str] = []

    if think_enabled:
        system_parts.append(
            "你处于深度推理模式。回答时先进行多步分析、识别假设、交叉验证关键信息，再给出结构化结论。不要泄露内部链路日志，但要在最终答案中体现严谨的推理顺序。"
        )

    if agent.system_prompt:
        system_parts.append(agent.system_prompt)

    prompt_block = _collect_prompt_context_from_cache(cfg)
    if prompt_block:
        system_parts.append(prompt_block)

    memory_block = await _collect_memory_context(session, chat_session, agent)
    if memory_block:
        system_parts.append(memory_block)

    skill_block = _collect_skill_context_from_cache(cfg)
    if skill_block:
        system_parts.append(skill_block)

    mcp_catalog = _collect_mcp_catalog_from_cache(cfg)
    mcp_block = _format_mcp_catalog(mcp_catalog)
    if mcp_block:
        system_parts.append(mcp_block)

    if chat_session.search_enabled:
        web_results = None
        if search_web:
            web_results = await search_web(body.content, chat_session.search_provider)
        if web_results:
            search_text = "\n\n".join(
                f"- {item.get('title')}\n  URL: {item.get('url')}\n  摘要: {item.get('snippet')}"
                for item in web_results
            )
            system_parts.append(
                "以下是联网搜索结果，请优先引用有价值的来源并在回答中注明依据：\n\n"
                f"{search_text}"
            )
            step_index += 1
            session.add(
                RunStep(
                    run_id=run.id,
                    step_type="web_search",
                    name="web_search",
                    step_index=step_index,
                    input_json=json.dumps(
                        {
                            "query": body.content,
                            "provider": chat_session.search_provider,
                        }
                    ),
                    output_json=json.dumps(web_results, ensure_ascii=False),
                    metadata_json=json.dumps(
                        {"result_count": len(web_results)},
                        ensure_ascii=False,
                    ),
                )
            )

    rag_text, rag_count = await _collect_rag_context(agent, body.content)
    if rag_text:
        system_parts.append(
            f"以下是来自知识库的相关参考资料，请结合这些内容回答用户问题：\n\n{rag_text}"
        )
        step_index += 1
        session.add(
            RunStep(
                run_id=run.id,
                step_type="retrieval",
                name="knowledge_retrieval",
                step_index=step_index,
                input_json=json.dumps({"query": body.content, "kb_ids": _parse_json_array(agent.kb_ids_json)}),
                output_json=json.dumps({"result_count": rag_count, "content": rag_text}, ensure_ascii=False),
                metadata_json=json.dumps({"result_count": rag_count}, ensure_ascii=False),
            )
        )

    approval_required: dict[str, Any] | None = None
    try:
        action_context, action_step = await _plan_and_maybe_execute_action(
            session=session,
            agent=agent,
            run=run,
            next_step_index=step_index + 1,
            body_content=body.content,
            conversation_messages=messages,
            model_id_str=model_id_str,
            provider_api_key=provider_api_key,
            provider_api_base=provider_api_base,
            provider_type=provider_type,
            system_parts=system_parts,
            mcp_catalog=mcp_catalog,
            cached_tools=cfg.tools if cfg.tools else None,
        )
        if action_context:
            system_parts.append(action_context)
            step_index += action_step
    except HitlApprovalRequired as hitl:
        # Save pending action to run metadata and signal approval required
        run_meta = _parse_json_value(run.metadata_json, {})
        run_meta["pending_action"] = {
            "action": hitl.action.action,
            "target": hitl.action.target,
            "arguments": hitl.action.arguments,
            "server_name": hitl.action.server_name,
            "sub_agent_id": hitl.action.sub_agent_id,
            "depth": hitl.action.depth,
            "label": hitl.action_label,
        }
        run.metadata_json = json.dumps(run_meta, ensure_ascii=False)
        session.add(run)
        approval_required = {
            "run_id": hitl.run_id,
            "action": hitl.action.action,
            "target": hitl.action.target,
            "arguments": hitl.action.arguments,
            "label": hitl.action_label,
        }

    # Collect tool call info for frontend indicators
    if step_index > 0 and action_context:
        tool_calls = _extract_tool_calls(action_context)
    else:
        tool_calls = []

    if agent.structured_output_enabled:
        try:
            schema = json.loads(agent.structured_output_schema_json or "{}")
        except Exception as exc:
            raise HTTPException(422, "Agent 结构化输出 schema 非法，请先修复后再对话") from exc
        if not isinstance(schema, dict):
            raise HTTPException(422, "Agent 结构化输出 schema 必须是 JSON 对象")
        model_call_options["response_format"] = {
            "type": "json_schema",
            "json_schema": {
                "name": "agent_output",
                "strict": True,
                "schema": schema,
            },
        }

    if system_parts:
        messages = [{"role": "system", "content": "\n\n".join(system_parts)}] + messages

    await session.commit()
    return AgentPreparedRequest(
        messages=messages,
        model_id_str=model_id_str,
        provider_api_key=provider_api_key,
        provider_api_base=provider_api_base,
        provider_type=provider_type,
        step_index=step_index,
        model_call_options=model_call_options,
        approval_required=approval_required,
        tool_calls=tool_calls if tool_calls else None,
    )


async def _load_history(session: AsyncSession, session_id: str) -> list[ChatMessage]:
    result = await session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return list(result.all())


async def _resolve_model_creds(session: AsyncSession, model_db_id: str | None):
    model_id_str = "gpt-3.5-turbo"
    provider_api_key: str | None = None
    provider_api_base: str | None = None
    provider_type: str | None = None

    if not model_db_id:
        return model_id_str, provider_api_key, provider_api_base, provider_type

    model_obj = await session.get(Model, model_db_id)
    if not model_obj:
        return model_id_str, provider_api_key, provider_api_base, provider_type

    model_id_str = model_obj.model_id
    if model_obj.provider_id:
        provider = await session.get(Provider, model_obj.provider_id)
        if provider:
            provider_api_key = provider.api_key_encrypted or None
            provider_api_base = provider.base_url or None
            provider_type = provider.provider_type or None

    return model_id_str, provider_api_key, provider_api_base, provider_type


async def _collect_memory_context(
    session: AsyncSession, chat_session: ChatSession, agent: Agent
) -> str:
    """Collect memory facts from all enabled sources: global, agent, and model.

    Each source is independent — enabling one does not require the others.
    The session-level toggle is the gate: it must be ON for this conversation
    to collect any memories.
    """
    if not chat_session.memory_enabled:
        return ""

    from app.api.v1.routers.memories import _global_memory_enabled

    memory_sets: list[list[Memory]] = []

    # 1. Global memory — all session-scoped memories, always collected when on
    if _global_memory_enabled:
        stmt = (
            select(Memory)
            .where(Memory.session_id == chat_session.id)
            .order_by(Memory.created_at.desc())
            .limit(20)
        )
        result = await session.exec(stmt)
        memory_sets.append(result.all())

    # 2. Agent-scoped memory — memories tied to this specific agent
    if agent.memory_enabled:
        stmt = (
            select(Memory)
            .where(Memory.scope == "agent", Memory.scope_id == agent.id)
            .order_by(Memory.created_at.desc())
            .limit(20)
        )
        result = await session.exec(stmt)
        memory_sets.append(result.all())

    # 3. Model-scoped memory — memories tied to the agent's model
    if agent.model_id:
        from app.models import Model
        model = await session.get(Model, agent.model_id)
        if model and model.memory_enabled:
            stmt = (
                select(Memory)
                .where(Memory.scope == "model", Memory.scope_id == model.id)
                .order_by(Memory.created_at.desc())
                .limit(20)
            )
            result = await session.exec(stmt)
            memory_sets.append(result.all())

    # Deduplicate by ID and combine
    seen: set[str] = set()
    all_memories: list[Memory] = []
    for mem_set in memory_sets:
        for m in mem_set:
            if m.id not in seen:
                seen.add(m.id)
                all_memories.append(m)

    if not all_memories:
        return ""

    facts = [f"- {m.key}: {m.value}" for m in all_memories if m.key and m.value]
    if not facts:
        return ""

    return "以下是之前对话中记录的关键信息，请在回答时参考这些记忆：\n" + "\n".join(facts)


def _collect_prompt_context_from_cache(cfg: _CachedAgentConfig) -> str:
    prompts: list[str] = []
    for prompt in cfg.prompts:
        if prompt.content:
            prompts.append(f"[{prompt.name}]\n{prompt.content}")
    if not prompts:
        return ""
    return "以下是该 agent 绑定的提示词，请作为长期行为约束与参考：\n\n" + "\n\n".join(prompts)


def _collect_skill_context_from_cache(cfg: _CachedAgentConfig) -> str:
    blocks = [_format_skill(s) for s in cfg.skills if s.enabled]
    if not blocks:
        return ""
    return "以下是该 agent 挂载的技能说明，请在需要时遵循其约束：\n\n" + "\n\n".join(blocks)


def _collect_mcp_catalog_from_cache(cfg: _CachedAgentConfig) -> list[dict[str, Any]]:
    catalog: list[dict[str, Any]] = []
    for server in cfg.mcp_servers:
        capabilities = _parse_json_value(server.capabilities_json, [])
        catalog.append({
            "id": server.id, "name": server.name, "transport": server.transport,
            "capabilities": capabilities if isinstance(capabilities, list) else [],
        })
    return catalog


async def _collect_prompt_context(session: AsyncSession, agent: Agent) -> str:
    prompt_ids = _parse_json_array(agent.prompt_ids_json)
    if not prompt_ids:
        return ""

    prompts: list[str] = []
    for prompt_id in prompt_ids:
        prompt = await session.get(Prompt, prompt_id)
        if prompt and prompt.enabled and prompt.content:
            prompts.append(f"[{prompt.name}]\n{prompt.content}")

    if not prompts:
        return ""
    return "以下是该 agent 绑定的提示词，请作为长期行为约束与参考：\n\n" + "\n\n".join(prompts)


async def _collect_skill_context(session: AsyncSession, agent: Agent) -> str:
    skill_ids = _parse_json_array(agent.skill_ids_json)
    if not skill_ids:
        return ""

    blocks: list[str] = []
    for skill_id in skill_ids:
        skill = await session.get(Skill, skill_id)
        if not skill or not skill.enabled:
            continue
        blocks.append(_format_skill(skill))

    if not blocks:
        return ""
    return "以下是该 agent 挂载的技能说明，请在需要时遵循其约束：\n\n" + "\n\n".join(blocks)


async def _collect_mcp_catalog(session: AsyncSession, agent: Agent) -> list[dict[str, Any]]:
    server_ids = _parse_json_array(agent.mcp_server_ids_json)
    if not server_ids:
        return []

    catalog: list[dict[str, Any]] = []
    for server_id in server_ids:
        server = await session.get(MCPServer, server_id)
        if not server or not server.enabled:
            continue
        capabilities = _parse_json_value(server.capabilities_json, [])
        catalog.append(
            {
                "id": server.id,
                "name": server.name,
                "transport": server.transport,
                "capabilities": capabilities if isinstance(capabilities, list) else [],
            }
        )

    return catalog


def _format_mcp_catalog(catalog: list[dict[str, Any]]) -> str:
    if not catalog:
        return ""

    blocks: list[str] = []
    for server in catalog:
        capability_names = [
            item.get("name")
            for item in server.get("capabilities", [])
            if isinstance(item, dict) and item.get("name")
        ]
        capability_text = ", ".join(capability_names[:12]) if capability_names else "未探测到能力详情"
        blocks.append(
            f"[{server.get('name')}] transport={server.get('transport')}; capabilities={capability_text}"
        )

    return "该 agent 关联了以下 MCP 服务器，可在需要时选择其 tool/prompt/resource：\n" + "\n".join(blocks)


async def _collect_rag_context(agent: Agent, query: str) -> tuple[str, int]:
    kb_ids = _parse_json_array(agent.kb_ids_json)
    if not kb_ids or not query_kb:
        return "", 0

    rag_chunks: list[dict[str, Any]] = []
    for kb_id in kb_ids:
        try:
            chunks = await query_kb(kb_id, query, top_k=3)
        except Exception as exc:
            logger.warning("RAG retrieval failed for kb %s: %s", kb_id, exc)
            continue
        rag_chunks.extend(chunks)

    if not rag_chunks:
        return "", 0

    rag_text = "\n\n".join(chunk.get("text", "") for chunk in rag_chunks if chunk.get("text"))
    return rag_text, len(rag_chunks)


# IDs of built-in tools that are always available to every agent
_BUILTIN_TOOL_IDS = {"builtin-web-search", "builtin-file-io", "builtin-cli"}


async def _plan_and_maybe_execute_action(
    session: AsyncSession,
    agent: Agent,
    run: Run,
    next_step_index: int,
    body_content: str,
    conversation_messages: list[dict[str, Any]],
    model_id_str: str,
    provider_api_key: str | None,
    provider_api_base: str | None,
    provider_type: str | None,
    system_parts: list[str],
    mcp_catalog: list[dict[str, Any]],
    depth: int = 0,
    cached_tools: list[Tool] | None = None,
) -> tuple[str, int]:
    has_mcp = bool(mcp_catalog)
    has_subagents = bool(_parse_json_array(agent.sub_agent_ids_json))

    if cached_tools is not None:
        # Use the pre-loaded tools from session cache
        tools = cached_tools
    else:
        all_tool_ids = _BUILTIN_TOOL_IDS | set(_parse_json_array(agent.tool_ids_json))
        tools = []
        for tool_id in all_tool_ids:
            tool = await session.get(Tool, tool_id)
            if tool and tool.enabled:
                tools.append(tool)

    if not tools and not has_mcp and not has_subagents:
        return "", 0

    tool_specs = _build_tool_specs(tools, session, agent, depth)

    planner_system = (
        "你是 agent 的动作规划器。根据用户问题，判断是否需要调用外部动作。"
        "如果不需要，输出 JSON: {\"action\":\"respond\"}。"
        "如果需要调用普通工具，输出 JSON: {\"action\":\"tool\",\"target\":\"工具名\",\"arguments\":{...}}。"
    )
    if has_subagents:
        planner_system += (
            "如果需要委派子任务给子 Agent，输出 JSON: "
            "{\"action\":\"subagent\",\"target\":\"子Agent工具名\",\"arguments\":{\"task\":\"委派任务描述\"}}。"
        )
    if has_mcp:
        planner_system += (
            "如果需要调用 MCP，输出 JSON: "
            "{\"action\":\"mcp_tool\"|\"mcp_prompt\"|\"mcp_resource\","
            "\"server_name\":\"服务器名\",\"target\":\"目标名或URI\",\"arguments\":{...}}。"
            "resource 的 target 必须是 URI。"
        )
    planner_system += "只能输出单个 JSON 对象，不要输出 Markdown。"

    planner_messages = [
        {"role": "system", "content": planner_system},
        {
            "role": "user",
            "content": json.dumps(
                {
                    "available_tools": tool_specs,
                    "available_mcp_servers": mcp_catalog,
                    "conversation": conversation_messages[-6:],
                    "latest_user_message": body_content,
                    "agent_constraints": system_parts[-4:],
                },
                ensure_ascii=False,
            ),
        },
    ]

    try:
        planner_output = await llm_complete_text(
            model_id_str,
            planner_messages,
            api_key=provider_api_key,
            api_base=provider_api_base,
            provider_type=provider_type,
            temperature=0,
            max_tokens=360,
        )
        decision = _parse_agent_action(planner_output)
    except Exception as exc:
        logger.warning("Action planner failed for agent %s: %s", agent.id, exc)
        return "", 0

    if decision.action == "respond":
        return "", 0

    # ── HITL check ──────────────────────────────────────────────────────────
    if agent.hitl_enabled and _hitl_applies(agent.hitl_approval_level, decision):
        raise HitlApprovalRequired(
            run_id=run.id,
            action=decision,
            action_label=f"{decision.action}/{decision.target}",
        )

    if decision.action == "tool":
        return await _execute_tool_action(
            tools=tools,
            run=run,
            next_step_index=next_step_index,
            decision=decision,
            body_content=body_content,
            session=session,
            agent=agent,
        )

    if decision.action == "subagent":
        return await _execute_subagent_action(
            session=session,
            agent=agent,
            run=run,
            next_step_index=next_step_index,
            decision=decision,
            model_id_str=model_id_str,
            provider_api_key=provider_api_key,
            provider_api_base=provider_api_base,
            provider_type=provider_type,
            depth=depth,
        )

    if decision.action in {"mcp_tool", "mcp_prompt", "mcp_resource"}:
        return await _execute_mcp_action(
            session=session,
            agent=agent,
            run=run,
            next_step_index=next_step_index,
            decision=decision,
        )

    logger.warning("Planner returned unsupported action '%s' for agent %s", decision.action, agent.id)
    return "", 0


def _extract_tool_calls(action_context: str) -> list[dict[str, Any]]:
    """Parse tool call info from action context text for frontend indicators."""
    calls: list[dict[str, Any]] = []
    # Match "工具名: <name>" or "服务器: <name>" patterns
    tool_match = re.search(r"工具名:\s*(.+)", action_context)
    if tool_match:
        calls.append({"type": "tool", "name": tool_match.group(1).strip()})
    mcp_match = re.search(r"服务器:\s*(.+)", action_context)
    if mcp_match:
        calls.append({"type": "mcp", "name": mcp_match.group(1).strip()})
    sub_match = re.search(r"子 Agent「(.+?)」", action_context)
    if sub_match:
        calls.append({"type": "subagent", "name": sub_match.group(1).strip()})
    return calls


def _hitl_applies(approval_level: str, decision: AgentAction) -> bool:
    """Check whether the planned action requires human approval."""
    if approval_level == "all":
        return True
    if approval_level == "tool_call" and decision.action in ("tool", "subagent"):
        return True
    if approval_level == "mcp_call" and decision.action in ("mcp_tool", "mcp_prompt", "mcp_resource"):
        return True
    return False


def _build_tool_specs(
    tools: list[Tool],
    session: AsyncSession | None,
    agent: Agent,
    depth: int,
) -> list[dict[str, Any]]:
    """Build tool specs including regular tools and subagent wrappers."""
    specs = [
        {
            "name": tool.name,
            "description": tool.description or "",
            "parameters_schema": _parse_json_value(tool.parameters_schema_json, {}),
        }
        for tool in tools
    ]
    # Wrap subagents as tools
    sub_agent_ids = _parse_json_array(agent.sub_agent_ids_json)
    max_depth = getattr(agent, "sub_agent_max_depth", 1)
    if depth >= max_depth:
        # Don't add subagent tools when at recursion limit
        return specs
    for sub_id in sub_agent_ids:
        sub_spec = _build_subagent_tool_spec(sub_id)
        if sub_spec:
            specs.append(sub_spec)
    return specs


def _build_subagent_tool_spec(sub_agent_id: str) -> dict[str, Any] | None:
    """Build a tool spec description for a subagent. Name encodes the ID for later lookup."""
    return {
        "name": f"subagent_{sub_agent_id[:8]}",
        "description": (
            "Delegate a subtask to a sub-agent. The sub-agent will work independently "
            "and return a result. Use this for complex subtasks that need separate context."
        ),
        "parameters_schema": {
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": "The complete task description to delegate",
                },
            },
            "required": ["task"],
        },
    }


def _extract_skill_md_body(skill_md: str) -> str:
    """Strip YAML frontmatter from SKILL.md and return the body."""
    text = skill_md.lstrip("﻿").strip()
    if not text.startswith("---"):
        return text
    lines = text.splitlines()
    if len(lines) < 3:
        return text
    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end_idx = i
            break
    if end_idx is None:
        return text
    return "\n".join(lines[end_idx + 1:]).strip()


def _resolve_skill_disk_root(skill: Skill) -> Path | None:
    """Try to locate the skill folder on disk. Returns None if not found."""
    skill_name = skill.name
    if skill.package_name:
        if "@" in skill.package_name:
            skill_name = skill.package_name.split("@")[-1]
        elif "/" in skill.package_name:
            skill_name = skill.package_name.split("/")[-1]

    from app.core.config import settings

    candidates = [
        Path(settings.SKILLS_DIR) / skill_name,
        Path.cwd() / ".claude" / "skills" / skill_name,
        Path.cwd() / ".agents" / "skills" / skill_name,
        Path.cwd() / "skills" / skill_name,
        Path.home() / ".claude" / "skills" / skill_name,
        Path.home() / ".agents" / "skills" / skill_name,
    ]
    for candidate in candidates:
        try:
            if candidate.exists() and candidate.is_dir():
                return candidate.resolve()
        except OSError:
            continue
    return None


def _format_skill(skill: Skill) -> str:
    summary: list[str] = [f"[{skill.name}] type={skill.skill_type}"]
    if skill.description:
        summary.append(skill.description)

    # Try reading SKILL.md from disk first
    root = _resolve_skill_disk_root(skill)
    if root is not None:
        skill_md_path = root / "SKILL.md"
        try:
            if skill_md_path.exists():
                skill_md = skill_md_path.read_text(encoding="utf-8")
                body = _extract_skill_md_body(skill_md)
                if body:
                    summary.append(body)
                    return "\n".join(summary)
        except OSError:
            pass

    # Fall back to content_json
    payload = _parse_json_value(skill.content_json, {})
    if isinstance(payload, dict) and payload:
        skill_md = payload.get("SKILL.md") or payload.get("skill.md")
        if isinstance(skill_md, str):
            body = _extract_skill_md_body(skill_md)
            if body:
                summary.append(body)
        for key in ("prompt", "instruction", "description", "steps"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                if key == "description":
                    continue
                summary.append(f"{key}: {value.strip()}")
            elif isinstance(value, list) and value:
                rendered = "; ".join(str(item) for item in value[:6])
                summary.append(f"{key}: {rendered}")
    elif isinstance(payload, str) and payload.strip():
        summary.append(payload.strip())
    elif skill.content_json:
        raw = skill.content_json.strip()
        if raw and not raw.startswith("{"):
            body = _extract_skill_md_body(raw)
            if body:
                summary.append(body)

    return "\n".join(summary)


def _parse_json_array(raw: str | None) -> list[str]:
    value = _parse_json_value(raw, [])
    if not isinstance(value, list):
        return []
    return [str(item) for item in value if item]


def _parse_json_value(raw: str | None, default: Any) -> Any:
    if raw is None:
        return default
    try:
        return json.loads(raw)
    except Exception:
        return default


def _parse_tool_decision(text: str) -> dict[str, Any]:
    candidate = text.strip()
    fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", candidate, re.DOTALL)
    if fence_match:
        candidate = fence_match.group(1)
    else:
        brace_match = re.search(r"(\{.*\})", candidate, re.DOTALL)
        if brace_match:
            candidate = brace_match.group(1)

    parsed = json.loads(candidate)
    if not isinstance(parsed, dict):
        raise ValueError("tool decision must be a JSON object")
    return parsed


async def _execute_tool_action(
    tools: list[Tool],
    run: Run,
    next_step_index: int,
    decision: AgentAction,
    body_content: str,
    session: AsyncSession,
    agent: Agent,
) -> tuple[str, int]:
    selected_tool = next((tool for tool in tools if tool.name == decision.target), None)
    if not selected_tool:
        logger.warning("Planner selected unknown tool '%s' for agent %s", decision.target, agent.id)
        return "", 0

    tool_input = decision.arguments if isinstance(decision.arguments, dict) else {}
    if not tool_input:
        tool_input = {"message": body_content}

    # Inject working directory for CLI / file_io tools.
    # Explicit agent setting takes priority; otherwise fall back to repo root
    # (NOT os.getcwd() — that could be a system directory).
    if selected_tool.tool_type in ("cli", "file_io"):
        cwd = agent.working_directory or _AGENT_DEFAULT_CWD
        if "cwd" not in tool_input:
            tool_input["cwd"] = cwd
        if selected_tool.tool_type == "file_io" and "workspace_root" not in tool_input:
            tool_input["workspace_root"] = agent.working_directory or _AGENT_DEFAULT_CWD

    import time

    started = time.perf_counter()
    try:
        tool_output = await execute_tool(selected_tool, tool_input)
    except Exception as exc:
        await record_step(
            session,
            run.id,
            step_type="tool_call",
            name=selected_tool.name,
            step_index=next_step_index,
            input_data=tool_input,
            output_data={"error": str(exc)},
            metadata={"tool_type": selected_tool.tool_type, "planned_by_agent": True},
            status="failed",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        raise

    await record_step(
        session,
        run.id,
        step_type="tool_call",
        name=selected_tool.name,
        step_index=next_step_index,
        input_data=tool_input,
        output_data=tool_output,
        metadata={"tool_type": selected_tool.tool_type, "planned_by_agent": True},
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return (
        "以下是你刚刚调用的工具结果，请基于这些结果自然地回答用户：\n\n"
        f"工具名: {selected_tool.name}\n"
        f"工具输入: {json.dumps(tool_input, ensure_ascii=False)}\n"
        f"工具输出: {json.dumps(tool_output, ensure_ascii=False)}",
        1,
    )


async def _execute_subagent_action(
    session: AsyncSession,
    agent: Agent,
    run: Run,
    next_step_index: int,
    decision: AgentAction,
    model_id_str: str,
    provider_api_key: str | None,
    provider_api_base: str | None,
    provider_type: str | None,
    depth: int,
) -> tuple[str, int]:
    """Execute a subagent call. The subagent runs independently with its own context."""
    sub_agent_ids = _parse_json_array(agent.sub_agent_ids_json)
    # Find the subagent by matching the first 8 chars of its ID against the tool name
    sub_agent = None
    for sub_id in sub_agent_ids:
        if decision.target == f"subagent_{sub_id[:8]}":
            sub_agent = await session.get(Agent, sub_id)
            break
    if not sub_agent:
        # Fallback: try direct ID match
        for sub_id in sub_agent_ids:
            sub_agent = await session.get(Agent, sub_id)
            if sub_agent:
                break
    if not sub_agent:
        logger.warning("Subagent not found for decision target '%s'", decision.target)
        return "", 0

    task = (decision.arguments or {}).get("task", decision.arguments.get("message", "process this task"))

    import time

    started = time.perf_counter()
    step_name = f"subagent:{sub_agent.name}"
    try:
        # Build subagent request
        sub_model_id, sub_api_key, sub_api_base, sub_provider_type = await _resolve_model_creds(
            session, sub_agent.model_id
        )
        sub_system_parts: list[str] = []
        if sub_agent.system_prompt:
            sub_system_parts.append(sub_agent.system_prompt)

        prompt_block = await _collect_prompt_context(session, sub_agent)
        if prompt_block:
            sub_system_parts.append(prompt_block)

        skill_block = await _collect_skill_context(session, sub_agent)
        if skill_block:
            sub_system_parts.append(skill_block)

        sub_mcp_catalog = await _collect_mcp_catalog(session, sub_agent)
        mcp_block = _format_mcp_catalog(sub_mcp_catalog)
        if mcp_block:
            sub_system_parts.append(mcp_block)

        # Allow subagent one level of its own tool execution (but no further subagents at max depth)
        sub_next_depth = depth + 1
        max_depth = getattr(agent, "sub_agent_max_depth", 1)
        if sub_next_depth <= max_depth:
            try:
                action_context, action_step = await _plan_and_maybe_execute_action(
                    session=session,
                    agent=sub_agent,
                    run=run,
                    next_step_index=next_step_index + 1,
                    body_content=task,
                    conversation_messages=[{"role": "user", "content": task}],
                    model_id_str=sub_model_id,
                    provider_api_key=sub_api_key,
                    provider_api_base=sub_api_base,
                    provider_type=sub_provider_type,
                    system_parts=sub_system_parts,
                    mcp_catalog=sub_mcp_catalog,
                    depth=sub_next_depth,
                )
                if action_context:
                    sub_system_parts.append(action_context)
            except HitlApprovalRequired:
                # Subagents bypass HITL — auto-execute without approval
                pass

        sub_messages = [{"role": "system", "content": "\n\n".join(sub_system_parts)}] if sub_system_parts else []
        sub_messages.append({"role": "user", "content": task})

        sub_call_options: dict[str, Any] = {
            "temperature": sub_agent.temperature,
            "max_tokens": sub_agent.max_tokens,
        }
        if sub_agent.structured_output_enabled:
            try:
                schema = json.loads(sub_agent.structured_output_schema_json or "{}")
                if isinstance(schema, dict):
                    sub_call_options["response_format"] = {
                        "type": "json_schema",
                        "json_schema": {"name": "subagent_output", "strict": True, "schema": schema},
                    }
            except Exception:
                pass

        sub_response = await llm_complete_text(
            sub_model_id,
            sub_messages,
            api_key=sub_api_key,
            api_base=sub_api_base,
            provider_type=sub_provider_type,
            temperature=sub_agent.temperature,
            max_tokens=sub_agent.max_tokens,
            **(sub_call_options if "response_format" in sub_call_options else {}),
        )
    except Exception as exc:
        logger.warning("Subagent execution failed for %s: %s", sub_agent.name, exc)
        await record_step(
            session,
            run.id,
            step_type="tool_call",
            name=step_name,
            step_index=next_step_index,
            input_data={"task": task, "sub_agent_id": sub_agent.id},
            output_data={"error": str(exc)},
            metadata={"sub_agent": True, "depth": depth + 1},
            status="failed",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return (
            f"子 Agent「{sub_agent.name}」执行失败: {str(exc)}",
            1,
        )

    await record_step(
        session,
        run.id,
        step_type="tool_call",
        name=step_name,
        step_index=next_step_index,
        input_data={"task": task, "sub_agent_id": sub_agent.id},
        output_data={"response": sub_response},
        metadata={"sub_agent": True, "depth": depth + 1, "sub_agent_name": sub_agent.name},
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    return (
        f"以下是子 Agent「{sub_agent.name}」执行子任务的结果。请综合这些结果来回答用户：\n\n"
        f"委派任务: {task}\n"
        f"子 Agent 回复:\n{sub_response}",
        1,
    )


async def _execute_mcp_action(
    session: AsyncSession,
    agent: Agent,
    run: Run,
    next_step_index: int,
    decision: AgentAction,
) -> tuple[str, int]:
    server = await _get_enabled_mcp_server_by_name(session, decision.server_name, agent)
    if not server:
        logger.warning("Planner selected unknown MCP server '%s' for agent %s", decision.server_name, agent.id)
        return "", 0

    import time

    started = time.perf_counter()
    try:
        if decision.action == "mcp_tool":
            result = await execute_mcp_tool(server, decision.target, decision.arguments)
        elif decision.action == "mcp_prompt":
            prompt_args = {str(k): str(v) for k, v in decision.arguments.items()}
            result = await execute_mcp_prompt(server, decision.target, prompt_args)
        elif decision.action == "mcp_resource":
            result = await execute_mcp_resource(server, decision.target)
        else:
            return "", 0
    except Exception as exc:
        logger.warning("MCP execution failed on server %s: %s", server.name, exc)
        await record_step(
            session,
            run.id,
            step_type="mcp_call",
            name=f"{server.name}:{decision.target}",
            step_index=next_step_index,
            input_data={
                "action": decision.action,
                "server_name": server.name,
                "target": decision.target,
                "arguments": decision.arguments,
            },
            output_data={"error": str(exc)},
            metadata={"server_id": server.id},
            status="failed",
            latency_ms=int((time.perf_counter() - started) * 1000),
        )
        return "", 0

    await record_step(
        session,
        run.id,
        step_type="mcp_call",
        name=f"{server.name}:{decision.target}",
        step_index=next_step_index,
        input_data={
            "action": decision.action,
            "server_name": server.name,
            "target": decision.target,
            "arguments": decision.arguments,
        },
        output_data=result.payload,
        metadata={"server_id": server.id, "operation": result.operation},
        latency_ms=int((time.perf_counter() - started) * 1000),
    )
    mcp_context = (
        "以下是你刚刚调用的 MCP 结果，请基于这些结果自然地回答用户：\n\n"
        f"服务器: {result.server_name}\n"
        f"操作: {result.operation}\n"
        f"目标: {result.target}\n"
        f"结果: {json.dumps(result.payload, ensure_ascii=False)}"
    )
    return mcp_context, 1


async def _get_enabled_mcp_server_by_name(session: AsyncSession, server_name: str, agent: Agent) -> MCPServer | None:
    allowed_ids = set(_parse_json_array(agent.mcp_server_ids_json))
    if not allowed_ids:
        return None

    for server_id in allowed_ids:
        server = await session.get(MCPServer, server_id)
        if server and server.enabled and server.name == server_name:
            return server
    return None


def _parse_agent_action(text: str) -> AgentAction:
    parsed = _parse_tool_decision(text)
    action = str(parsed.get("action") or "respond").strip()
    if action == "respond":
        return AgentAction(action="respond", target="", arguments={})

    target = str(parsed.get("target") or parsed.get("tool_name") or "").strip()
    server_name = str(parsed.get("server_name") or "").strip()
    arguments = parsed.get("arguments")
    if not isinstance(arguments, dict):
        arguments = parsed.get("tool_input")
    if not isinstance(arguments, dict):
        arguments = {}
    return AgentAction(
        action=action,
        target=target,
        arguments=arguments,
        server_name=server_name,
    )
