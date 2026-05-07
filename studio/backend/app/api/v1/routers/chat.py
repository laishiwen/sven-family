from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import ChatSession, ChatMessage, Run, RunStep, Model, Agent, Provider
from app.schemas import (
    ChatSessionCreate, ChatSessionResponse,
    ChatMessageCreate, ChatMessageResponse,
    RunResponse,
)
from app.integrations.llm.client import llm_chat, llm_chat_events
from app.services.agent_runtime import prepare_agent_request
from app.services.observability import (
    finalize_run_failure,
    finalize_run_success,
    record_artifact,
    record_score,
    safe_json_dumps,
)
from datetime import datetime
import json
import uuid
import logging

# Try to import optional features, but don't fail if they're not available
try:
    from app.integrations.llamaindex.retriever import query_kb
except ImportError:
    query_kb = None

try:
    from app.services.web_search import search_web
except ImportError:
    search_web = None

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["Chat"])


def _normalize_session_payload(payload: dict, current_mode: str | None = None) -> dict:
    normalized = dict(payload)
    explicit_mode = normalized.get("mode")
    if explicit_mode is not None:
        mode = str(explicit_mode).strip().lower()
    elif normalized.get("model_id"):
        mode = "model"
    elif normalized.get("agent_id"):
        mode = "agent"
    else:
        mode = str(current_mode or "model").strip().lower()
    normalized["mode"] = "agent" if mode == "agent" else "model"
    if normalized["mode"] == "agent":
        normalized["model_id"] = None
    else:
        normalized["agent_id"] = None
    return normalized


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
        prov = await session.get(Provider, model_obj.provider_id)
        if prov:
            provider_api_key = prov.api_key_encrypted or None
            provider_api_base = prov.base_url or None
            provider_type = prov.provider_type or None

    return model_id_str, provider_api_key, provider_api_base, provider_type


async def _build_model_chat_request(
    session: AsyncSession,
    chat_session: ChatSession,
    body: ChatMessageCreate,
    run: Run,
    think_enabled: bool,
):
    history_result = await session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == chat_session.id)
        .order_by(ChatMessage.created_at.asc())
    )
    history = history_result.all()
    messages = [{"role": m.role, "content": m.content} for m in history]

    model_id_str, provider_api_key, provider_api_base, provider_type = await _resolve_model_creds(
        session, chat_session.model_id
    )
    step_index = 0
    model_call_options: dict = {}

    if think_enabled:
        messages = [
            {
                "role": "system",
                "content": (
                    "你处于深度推理模式。回答时先进行多步分析、识别假设、"
                    "交叉验证关键信息，再给出结构化结论。不要泄露内部链路日志，"
                    "但要在最终答案中体现严谨的推理顺序。"
                ),
            }
        ] + messages

    if chat_session.search_enabled:
        web_results = None
        if search_web:
            web_results = await search_web(body.content, chat_session.search_provider)
        if web_results:
            search_text = "\n\n".join(
                f"- {item.get('title')}\n  URL: {item.get('url')}\n  摘要: {item.get('snippet')}"
                for item in web_results
            )
            messages = [
                {
                    "role": "system",
                    "content": (
                        "以下是联网搜索结果，请优先引用有价值的来源并在回答中注明依据：\n\n"
                        f"{search_text}"
                    ),
                }
            ] + messages
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
                        {"result_count": len(web_results)}, ensure_ascii=False
                    ),
                )
            )

    await session.commit()
    return (
        messages,
        model_id_str,
        provider_api_key,
        provider_api_base,
        provider_type,
        step_index,
        model_call_options,
    )


async def _persist_chat_success(
    session: AsyncSession,
    session_id: str,
    run: Run,
    full_response: str,
    step_index: int,
    messages: list[dict],
    model_id_str: str,
    reasoning_mode: str,
    think_enabled: bool,
):
    input_text = "\n".join(str(item.get("content", "")) for item in messages)
    assistant_msg = ChatMessage(
        session_id=session_id,
        role="assistant",
        content=full_response,
    )
    session.add(assistant_msg)

    await finalize_run_success(
        session,
        run,
        output_text=full_response,
        input_text=input_text,
    )
    session.add(
        RunStep(
            run_id=run.id,
            step_type="llm_call",
            name="chat_completion",
            step_index=step_index + 1,
            input_json=safe_json_dumps(
                {"message_count": len(messages), "model": model_id_str}
            ),
            output_json=safe_json_dumps({"response": full_response[:4000]}),
            metadata_json=safe_json_dumps(
                {
                    "reasoning_mode": reasoning_mode,
                    "think": think_enabled,
                    "input_tokens_estimated": run.input_tokens,
                    "output_tokens_estimated": run.output_tokens,
                },
            ),
        )
    )
    await record_artifact(
        session,
        run.id,
        artifact_type="completion",
        name="assistant_response",
        content=full_response,
        content_type="text/markdown",
    )
    if not full_response.strip():
        await record_score(
            session,
            run.id,
            name="non_empty_response",
            value=False,
            score_type="boolean",
            source="system",
            comment="Assistant response was empty.",
        )
    await session.commit()
    return assistant_msg


async def _persist_chat_failure(session: AsyncSession, run: Run, error: Exception):
    await finalize_run_failure(session, run, error)
    await record_score(
        session,
        run.id,
        name="run_success",
        value=False,
        score_type="boolean",
        source="system",
        comment=str(error),
    )


@router.get("/sessions", response_model=list[ChatSessionResponse])
async def list_sessions(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(ChatSession).order_by(ChatSession.updated_at.desc()))
    sessions_list = result.all()

    # Fetch last message preview for each session in one query
    if sessions_list:
        session_ids = [s.id for s in sessions_list]
        from sqlalchemy import func
        # Get the latest message per session
        subq = (
            select(
                ChatMessage.session_id,
                func.max(ChatMessage.created_at).label("max_created_at"),
            )
            .where(ChatMessage.session_id.in_(session_ids))
            .group_by(ChatMessage.session_id)
            .subquery()
        )
        msg_result = await session.exec(
            select(ChatMessage).join(
                subq,
                (ChatMessage.session_id == subq.c.session_id)
                & (ChatMessage.created_at == subq.c.max_created_at),
            )
        )
        last_msgs = {m.session_id: m for m in msg_result.all()}
    else:
        last_msgs = {}

    responses = []
    for s in sessions_list:
        data = s.model_dump()
        last_msg = last_msgs.get(s.id)
        if last_msg:
            preview = last_msg.content or ""
            data["last_message_preview"] = preview[:100] if len(preview) > 100 else preview
        else:
            data["last_message_preview"] = None
        responses.append(ChatSessionResponse(**data))
    return responses


@router.post("/sessions", response_model=ChatSessionResponse, status_code=201)
async def create_session(body: ChatSessionCreate, session: AsyncSession = Depends(get_session)):
    chat_session = ChatSession(**_normalize_session_payload(body.model_dump()))
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session_detail(session_id: str, session: AsyncSession = Depends(get_session)):
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")
    return chat_session


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: str, session: AsyncSession = Depends(get_session)):
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")
    # Delete child RunStep rows first (via Run), then Runs, then Messages
    runs_result = await session.exec(select(Run).where(Run.session_id == session_id))
    runs = runs_result.all()
    for run in runs:
        steps_result = await session.exec(select(RunStep).where(RunStep.run_id == run.id))
        for step in steps_result.all():
            await session.delete(step)
        await session.delete(run)
    messages_result = await session.exec(select(ChatMessage).where(ChatMessage.session_id == session_id))
    for msg in messages_result.all():
        await session.delete(msg)
    await session.delete(chat_session)
    await session.commit()


@router.patch("/sessions/{session_id}")
async def update_session(session_id: str, body: dict, session: AsyncSession = Depends(get_session)):
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")
    payload = _normalize_session_payload(body, chat_session.mode) if ("mode" in body or "agent_id" in body or "model_id" in body) else body
    for k, v in payload.items():
        if hasattr(chat_session, k):
            setattr(chat_session, k, v)
    chat_session.updated_at = datetime.utcnow()
    session.add(chat_session)
    await session.commit()
    await session.refresh(chat_session)
    return chat_session


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageResponse])
async def list_messages(session_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.exec(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.asc())
    )
    return result.all()


@router.post("/sessions/{session_id}/messages")
async def send_message(
    session_id: str,
    body: ChatMessageCreate,
    session: AsyncSession = Depends(get_session),
):
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")

    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=body.content,
    )
    session.add(user_msg)
    await session.commit()

    run = Run(
        id=str(uuid.uuid4()),
        session_id=session_id,
        agent_id=chat_session.agent_id,
        model_id=chat_session.model_id,
        trace_provider="local",
        status="running",
        metadata_json=json.dumps(
            {
                "reasoning_mode": chat_session.reasoning_mode,
                "stream_output": chat_session.stream_output,
                "search_enabled": chat_session.search_enabled,
                "search_provider": chat_session.search_provider,
                "think": body.think if body.think is not None else chat_session.reasoning_mode == "deep",
            }
        ),
    )
    session.add(run)
    await session.commit()

    try:
        think_enabled = body.think if body.think is not None else chat_session.reasoning_mode == "deep"
        if chat_session.mode == "agent":
            prepared = await prepare_agent_request(
                session,
                chat_session,
                body,
                run,
                think_enabled,
            )
            # HITL: return approval request instead of calling LLM
            if prepared.approval_required:
                return {
                    "type": "approval_required",
                    "run_id": run.id,
                    **prepared.approval_required,
                }
            messages = prepared.messages
            model_id_str = prepared.model_id_str
            provider_api_key = prepared.provider_api_key
            provider_api_base = prepared.provider_api_base
            provider_type = prepared.provider_type
            step_index = prepared.step_index
            model_call_options = prepared.model_call_options
        else:
            (
                messages,
                model_id_str,
                provider_api_key,
                provider_api_base,
                provider_type,
                step_index,
                model_call_options,
            ) = await _build_model_chat_request(session, chat_session, body, run, think_enabled)

        model_call_options["think"] = think_enabled

        full_response = ""
        async for chunk in llm_chat(
            model_id_str,
            messages,
            api_key=provider_api_key,
            api_base=provider_api_base,
            provider_type=provider_type,
            **model_call_options,
        ):
            full_response += chunk

        assistant_msg = await _persist_chat_success(
            session,
            session_id,
            run,
            full_response,
            step_index,
            messages,
            model_id_str,
            chat_session.reasoning_mode,
            think_enabled,
        )
        return {"run_id": run.id, "message": assistant_msg.content}
    except HTTPException as e:
        await _persist_chat_failure(session, run, e)
        raise
    except Exception as e:
        await _persist_chat_failure(session, run, e)
        raise HTTPException(500, str(e))


@router.post("/sessions/{session_id}/messages/stream")
async def stream_chat(
    session_id: str,
    body: ChatMessageCreate,
    session: AsyncSession = Depends(get_session),
):
    """SSE streaming chat endpoint"""
    import asyncio
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")

    # Save user message
    user_msg = ChatMessage(
        session_id=session_id,
        role="user",
        content=body.content,
    )
    session.add(user_msg)
    await session.commit()

    # Create run record
    run = Run(
        id=str(uuid.uuid4()),
        session_id=session_id,
        agent_id=chat_session.agent_id,
        model_id=chat_session.model_id,
        trace_provider="local",
        status="running",
        metadata_json=json.dumps(
            {
                "reasoning_mode": chat_session.reasoning_mode,
                "stream_output": chat_session.stream_output,
                "search_enabled": chat_session.search_enabled,
                "search_provider": chat_session.search_provider,
                "think": body.think if body.think is not None else chat_session.reasoning_mode == "deep",
            }
        ),
    )
    session.add(run)
    await session.commit()

    async def event_generator():
        full_response = ""
        try:
            think_enabled = body.think if body.think is not None else chat_session.reasoning_mode == "deep"
            if chat_session.mode == "agent":
                prepared = await prepare_agent_request(
                    session,
                    chat_session,
                    body,
                    run,
                    think_enabled,
                )
                # HITL: yield approval request event and stop
                if prepared.approval_required:
                    yield f"data: {json.dumps({'type': 'approval_required', 'run_id': run.id, **prepared.approval_required})}\n\n"
                    return
                messages = prepared.messages
                model_id_str = prepared.model_id_str
                provider_api_key = prepared.provider_api_key
                provider_api_base = prepared.provider_api_base
                provider_type = prepared.provider_type
                step_index = prepared.step_index
                model_call_options = prepared.model_call_options
                # Emit tool call events so the frontend can show search/action indicators
                if prepared.tool_calls:
                    for tc in prepared.tool_calls:
                        yield f"data: {json.dumps({'type': 'tool_call', **tc})}\n\n"
            else:
                (
                    messages,
                    model_id_str,
                    provider_api_key,
                    provider_api_base,
                    provider_type,
                    step_index,
                    model_call_options,
                ) = await _build_model_chat_request(session, chat_session, body, run, think_enabled)

            model_call_options["think"] = think_enabled

            # Raw passthrough from provider API so reasoning/content chunks arrive unchanged.
            async for raw_data in llm_chat_events(
                model_id_str,
                messages,
                api_key=provider_api_key,
                api_base=provider_api_base,
                provider_type=provider_type,
                **model_call_options,
            ):
                if raw_data == "[DONE]":
                    break

                try:
                    raw_obj = json.loads(raw_data)
                except json.JSONDecodeError:
                    continue

                choices = raw_obj.get("choices") or []
                if choices:
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
                    if content:
                        full_response += str(content)

                yield f"data: {raw_data}\n\n"

            await _persist_chat_success(
                session,
                session_id,
                run,
                full_response,
                step_index,
                messages,
                model_id_str,
                chat_session.reasoning_mode,
                think_enabled,
            )

            yield "data: [DONE]\n\n"

        except asyncio.CancelledError:
            # Client disconnected (page navigation, session switch, etc.)
            logger.info(f"Stream interrupted for session {session_id}")
            # Save whatever partial response we received so far
            if full_response.strip():
                assistant_msg = ChatMessage(
                    session_id=session_id,
                    role="assistant",
                    content=full_response.strip() + "\n\n*[回复中断 — 已切换页面]*",
                )
                session.add(assistant_msg)
            run.status = "interrupted"
            run.error_msg = "Client disconnected mid-stream"
            session.add(run)
            await session.commit()

        except Exception as e:
            logger.exception(f"Stream chat error for session {session_id}: {e}")
            await _persist_chat_failure(session, run, e)
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/sessions/{session_id}/messages/approve")
async def approve_hitl_action(
    session_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    """Approve or deny a HITL-pending action and execute or skip it."""
    from app.services.agent_runtime import (
        _parse_agent_action,
        _execute_tool_action,
        _execute_mcp_action,
        _execute_subagent_action,
        _parse_json_array,
        _parse_json_value,
        _resolve_model_creds,
        AgentAction,
    )

    run_id = body.get("run_id")
    approved = body.get("approved", False)

    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    run_meta = _parse_json_value(run.metadata_json, {})
    pending = run_meta.pop("pending_action", None)
    if not pending:
        raise HTTPException(400, "No pending action for this run")

    if not approved:
        run.metadata_json = json.dumps(run_meta)
        session.add(run)
        await session.commit()
        return {"type": "action_denied", "run_id": run_id, "action": pending}

    # Execute the previously pending action
    chat_session = await session.get(ChatSession, session_id)
    if not chat_session:
        raise HTTPException(404, "Session not found")

    agent = await session.get(Agent, chat_session.agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    model_id_str, provider_api_key, provider_api_base, provider_type = await _resolve_model_creds(
        session, agent.model_id
    )

    decision = AgentAction(
        action=pending["action"],
        target=pending["target"],
        arguments=pending.get("arguments", {}),
        server_name=pending.get("server_name", ""),
        sub_agent_id=pending.get("sub_agent_id", ""),
        depth=pending.get("depth", 0),
    )

    try:
        if decision.action == "tool":
            tool_ids = _parse_json_array(agent.tool_ids_json)
            tools: list[Any] = []
            for tool_id in tool_ids:
                from app.models import Tool
                tool = await session.get(Tool, tool_id)
                if tool and tool.enabled:
                    tools.append(tool)
            action_context, step_count = await _execute_tool_action(
                tools=tools, run=run, next_step_index=1, decision=decision,
                body_content="", session=session, agent=agent,
            )
        elif decision.action == "subagent":
            action_context, step_count = await _execute_subagent_action(
                session=session, agent=agent, run=run, next_step_index=1,
                decision=decision, model_id_str=model_id_str,
                provider_api_key=provider_api_key, provider_api_base=provider_api_base,
                provider_type=provider_type, depth=decision.depth,
            )
        elif decision.action in ("mcp_tool", "mcp_prompt", "mcp_resource"):
            action_context, step_count = await _execute_mcp_action(
                session=session, agent=agent, run=run, next_step_index=1, decision=decision,
            )
        else:
            action_context, step_count = "", 0
    except Exception as exc:
        run.metadata_json = json.dumps(run_meta)
        session.add(run)
        await session.commit()
        raise HTTPException(500, f"Action execution failed: {exc}")

    run.metadata_json = json.dumps(run_meta)
    session.add(run)
    await session.commit()

    return {
        "type": "action_approved",
        "run_id": run_id,
        "result": action_context,
    }


@router.post("/sessions/quick-run")
async def quick_run(body: dict, session: AsyncSession = Depends(get_session)):
    """Quick one-shot chat without creating a persistent session"""
    model_id = body.get("model_id")
    message = body.get("message", "")

    model_id_str = "gpt-3.5-turbo"
    if model_id:
        model_obj = await session.get(Model, model_id)
        if model_obj:
            model_id_str = model_obj.model_id

    response = ""
    async for chunk in llm_chat(model_id_str, [{"role": "user", "content": message}]):
        response += chunk

    return {"response": response}


@router.get("/sessions/{session_id}/runs", response_model=list[RunResponse])
async def list_runs(session_id: str, session: AsyncSession = Depends(get_session)):
    result = await session.exec(
        select(Run).where(Run.session_id == session_id).order_by(Run.created_at.desc())
    )
    return result.all()


# ── WebSocket chat transport ──────────────────────────────────────────────────

@router.websocket("/ws/{session_id}")
async def ws_chat(websocket: WebSocket, session_id: str):
    """Persistent WebSocket endpoint for chat. Reuses connection pool + config cache."""
    await websocket.accept()

    from app.core.database import async_session_factory

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "error": "Invalid JSON"}))
                continue

            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            if msg.get("type") != "send":
                continue

            content = str(msg.get("content", ""))
            think = bool(msg.get("think", False))

            async with async_session_factory() as db:
                chat_session = await db.get(ChatSession, session_id)
                if not chat_session:
                    await websocket.send_text(json.dumps({"type": "error", "error": "Session not found"}))
                    continue

                user_msg = ChatMessage(session_id=session_id, role="user", content=content)
                db.add(user_msg)

                run = Run(
                    id=str(uuid.uuid4()),
                    session_id=session_id,
                    agent_id=chat_session.agent_id,
                    model_id=chat_session.model_id,
                    trace_provider="local",
                    status="running",
                    metadata_json=json.dumps({
                        "reasoning_mode": chat_session.reasoning_mode,
                        "stream_output": True,
                        "search_enabled": chat_session.search_enabled,
                        "think": think,
                    }),
                )
                db.add(run)
                await db.commit()

                try:
                    if chat_session.mode == "agent":
                        prepared = await prepare_agent_request(db, chat_session, user_msg, run, think)
                        if prepared.approval_required:
                            await websocket.send_text(json.dumps({
                                "type": "approval_required",
                                "run_id": run.id,
                                **prepared.approval_required,
                            }))
                            continue
                        if prepared.tool_calls:
                            for tc in prepared.tool_calls:
                                await websocket.send_text(json.dumps({"type": "tool_call", **tc}))
                        messages = prepared.messages
                        model_id_str = prepared.model_id_str
                        provider_api_key = prepared.provider_api_key
                        provider_api_base = prepared.provider_api_base
                        provider_type = prepared.provider_type
                        model_call_options = prepared.model_call_options
                    else:
                        (messages, model_id_str, provider_api_key, provider_api_base,
                         provider_type, step_index, model_call_options,
                        ) = await _build_model_chat_request(db, chat_session, user_msg, run, think)

                    model_call_options["think"] = think
                    full_response = ""

                    async for raw_data in llm_chat_events(
                        model_id_str, messages,
                        api_key=provider_api_key, api_base=provider_api_base,
                        provider_type=provider_type, **model_call_options,
                    ):
                        if raw_data == "[DONE]":
                            break
                        try:
                            obj = json.loads(raw_data)
                        except json.JSONDecodeError:
                            continue
                        choices = obj.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        text = delta.get("content", "")
                        if text:
                            full_response += text
                            await websocket.send_text(json.dumps({
                                "type": "text",
                                "content": text,
                            }))

                    assistant_msg = ChatMessage(session_id=session_id, role="assistant", content=full_response)
                    db.add(assistant_msg)
                    await db.commit()

                    await websocket.send_text(json.dumps({
                        "type": "done",
                        "run_id": run.id,
                    }))

                except Exception as exc:
                    logger.exception("WebSocket chat error for session %s: %s", session_id, exc)
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "error": str(exc)[:500],
                    }))

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WebSocket handler error for session %s", session_id)
