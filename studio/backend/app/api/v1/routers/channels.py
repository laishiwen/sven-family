"""Channel management and webhook endpoints."""

import json
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models import Channel
from app.schemas import ChannelCreate, ChannelResponse, ChannelUpdate
from app.services.channel_service import get_channel, parse_config

router = APIRouter(prefix="/channels", tags=["Channels"])


@router.get("", response_model=list[ChannelResponse])
async def list_channels(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Channel))
    return result.all()


@router.post("", response_model=ChannelResponse, status_code=201)
async def create_channel(body: ChannelCreate, session: AsyncSession = Depends(get_session)):
    channel = Channel(**body.model_dump())
    session.add(channel)
    await session.commit()
    await session.refresh(channel)
    return channel


@router.get("/{channel_id}", response_model=ChannelResponse)
async def get_channel_route(channel_id: str, session: AsyncSession = Depends(get_session)):
    channel = await session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")
    return channel


@router.patch("/{channel_id}", response_model=ChannelResponse)
async def update_channel(channel_id: str, body: ChannelUpdate, session: AsyncSession = Depends(get_session)):
    channel = await session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")
    update_data = body.model_dump(exclude_unset=True)
    for k, v in update_data.items():
        setattr(channel, k, v)
    channel.updated_at = datetime.utcnow()
    session.add(channel)
    await session.commit()
    await session.refresh(channel)
    return channel


@router.delete("/{channel_id}", status_code=204)
async def delete_channel(channel_id: str, session: AsyncSession = Depends(get_session)):
    channel = await session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")
    await session.delete(channel)
    await session.commit()


@router.post("/{channel_id}/test")
async def test_channel(channel_id: str, session: AsyncSession = Depends(get_session)):
    """Test sending a message through the channel."""
    channel = await session.get(Channel, channel_id)
    if not channel:
        raise HTTPException(404, "Channel not found")

    config = parse_config(channel)
    svc = get_channel(channel.channel_type)

    test_chat_id = config.get("test_chat_id", "")
    if not test_chat_id:
        raise HTTPException(400, "Channel config must include test_chat_id for testing")

    try:
        msg_id = await svc.send_message(config, test_chat_id, "Hello from Sven Studio! This is a test message.")
        channel.health_status = "healthy"
        channel.last_checked_at = datetime.utcnow()
        session.add(channel)
        await session.commit()
        return {"status": "sent", "message_id": msg_id}
    except Exception as e:
        channel.health_status = "unhealthy"
        channel.last_checked_at = datetime.utcnow()
        session.add(channel)
        await session.commit()
        raise HTTPException(500, f"Test failed: {e}")


# ─── Webhook endpoints (no auth — verified internally) ───────────────────────

@router.post("/webhook/{channel_type}/{channel_id}")
async def channel_webhook(
    channel_type: str,
    channel_id: str,
    request: Request,
    session: AsyncSession = Depends(get_session),
):
    """Receive webhook events from external channels."""
    channel = await session.get(Channel, channel_id)
    if not channel or not channel.enabled:
        raise HTTPException(404, "Channel not found or disabled")

    config = parse_config(channel)
    svc = get_channel(channel_type)

    try:
        body = await request.json()
    except Exception:
        body = {}

    headers = dict(request.headers)

    # URL verification (Facebook / Feishu)
    if channel_type == "facebook" and body.get("hub.mode") == "subscribe":
        verified = await svc.verify_webhook(config, body, headers)
        if verified:
            return body.get("hub.challenge", "")
        raise HTTPException(403, "Webhook verification failed")

    if channel_type == "feishu" and body.get("type") == "url_verification":
        return {"challenge": body.get("challenge", "")}

    # Parse and acknowledge
    try:
        msg = svc.parse_webhook(body)
        # Store message in chat history if agent_id is set
        if channel.agent_id:
            from app.models import ChatSession, ChatMessage
            sesh_result = await session.exec(
                select(ChatSession).where(
                    ChatSession.agent_id == channel.agent_id,
                    ChatSession.name == f"Channel: {channel.name}",
                )
            )
            chat_session = sesh_result.first()
            if not chat_session:
                chat_session = ChatSession(
                    name=f"Channel: {channel.name}",
                    agent_id=channel.agent_id,
                )
                session.add(chat_session)
                await session.flush()

            session.add(ChatMessage(
                session_id=chat_session.id,
                role="user",
                content=f"[{channel_type}] {msg.sender_name}: {msg.content}",
                metadata_json=json.dumps({"channel_type": channel_type, "sender_id": msg.sender_id}),
            ))
            await session.commit()

        return {"status": "received"}
    except Exception as e:
        raise HTTPException(500, f"Failed to process webhook: {e}")
