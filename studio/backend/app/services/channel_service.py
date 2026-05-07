"""Channel integrations: Email, Feishu, Telegram, Facebook, etc."""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

import httpx
from fastapi import HTTPException

from app.models import Channel, ChatMessage, ChatSession

logger = logging.getLogger(__name__)


@dataclass
class ChannelMessage:
    """Normalized incoming message from any channel."""
    channel_type: str
    channel_id: str
    chat_id: str  # conversation/thread identifier
    sender_id: str
    sender_name: str
    content: str
    raw_data: dict[str, Any]


class ChannelBase(ABC):
    """Base class for channel integrations."""

    @abstractmethod
    async def send_message(self, config: dict[str, Any], chat_id: str, content: str) -> str:
        """Send a message to the channel. Returns message ID."""

    @abstractmethod
    async def verify_webhook(self, config: dict[str, Any], data: dict[str, Any], headers: dict[str, str]) -> bool:
        """Verify incoming webhook authenticity."""

    @abstractmethod
    def parse_webhook(self, data: dict[str, Any]) -> ChannelMessage:
        """Parse incoming webhook data into a normalized message."""


# ─── Telegram ────────────────────────────────────────────────────────────────

class TelegramChannel(ChannelBase):
    async def send_message(self, config: dict[str, Any], chat_id: str, content: str) -> str:
        bot_token = config.get("bot_token", "")
        if not bot_token:
            raise HTTPException(400, "Telegram bot_token is required")
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{bot_token}/sendMessage",
                json={"chat_id": chat_id, "text": content, "parse_mode": "Markdown"},
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                raise HTTPException(500, f"Telegram API error: {data.get('description')}")
            return str(data["result"]["message_id"])

    async def verify_webhook(self, config: dict[str, Any], data: dict[str, Any], headers: dict[str, str]) -> bool:
        token = config.get("webhook_secret", "")
        if not token:
            return True  # No secret configured, skip verification
        # Telegram doesn't sign webhooks; you can verify by checking the bot token
        return True

    def parse_webhook(self, data: dict[str, Any]) -> ChannelMessage:
        msg = data.get("message") or data.get("edited_message") or {}
        chat = msg.get("chat", {})
        sender = msg.get("from", {})
        return ChannelMessage(
            channel_type="telegram",
            channel_id=str(data.get("update_id", "")),
            chat_id=str(chat.get("id", "")),
            sender_id=str(sender.get("id", "")),
            sender_name=sender.get("first_name", "") or sender.get("username", ""),
            content=msg.get("text") or msg.get("caption") or "",
            raw_data=data,
        )


# ─── Feishu (Lark) ──────────────────────────────────────────────────────────

class FeishuChannel(ChannelBase):
    _token_cache: dict[str, tuple[str, float]] = {}  # app_id -> (token, expires_at)

    async def _get_access_token(self, config: dict[str, Any]) -> str:
        app_id = config.get("app_id", "")
        app_secret = config.get("app_secret", "")
        if not app_id or not app_secret:
            raise HTTPException(400, "Feishu app_id and app_secret are required")

        cached = self._token_cache.get(app_id)
        if cached and asyncio.get_event_loop().time() < cached[1] - 60:
            return cached[0]

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
                json={"app_id": app_id, "app_secret": app_secret},
            )
            resp.raise_for_status()
            data = resp.json()
            token = data.get("tenant_access_token", "")
            expires = asyncio.get_event_loop().time() + data.get("expire", 7200)
            self._token_cache[app_id] = (token, expires)
            return token

    async def send_message(self, config: dict[str, Any], chat_id: str, content: str) -> str:
        token = await self._get_access_token(config)
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://open.feishu.cn/open-apis/im/v1/messages",
                params={"receive_id_type": "chat_id"},
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "receive_id": chat_id,
                    "msg_type": "text",
                    "content": json.dumps({"text": content}),
                },
            )
            resp.raise_for_status()
            data = resp.json()
            if data.get("code") != 0:
                raise HTTPException(500, f"Feishu API error: {data.get('msg')}")
            return data.get("data", {}).get("message_id", "")

    async def verify_webhook(self, config: dict[str, Any], data: dict[str, Any], headers: dict[str, str]) -> bool:
        verification_token = config.get("verification_token", "")
        if verification_token:
            if data.get("token") == verification_token:
                return True
            if data.get("type") == "url_verification":
                return True
        return True

    def parse_webhook(self, data: dict[str, Any]) -> ChannelMessage:
        event = data.get("event", {})
        msg = event.get("message", {})
        sender = event.get("sender", {})
        sender_id = sender.get("sender_id", {})
        return ChannelMessage(
            channel_type="feishu",
            channel_id=data.get("schema", ""),
            chat_id=msg.get("chat_id", ""),
            sender_id=str(sender_id.get("open_id", "") or sender_id.get("user_id", "")),
            sender_name=sender.get("sender_id", {}).get("open_id", ""),
            content=json.loads(msg.get("content", "{}")).get("text", ""),
            raw_data=data,
        )


# ─── Email (SMTP/IMAP) ──────────────────────────────────────────────────────

class EmailChannel(ChannelBase):
    async def send_message(self, config: dict[str, Any], chat_id: str, content: str) -> str:
        smtp_host = config.get("smtp_host", "")
        smtp_port = int(config.get("smtp_port", "587"))
        smtp_user = config.get("smtp_user", "")
        smtp_pass = config.get("smtp_pass", "")
        from_addr = config.get("from_addr", smtp_user)

        if not smtp_host or not smtp_user:
            raise HTTPException(400, "SMTP host and user are required")

        import smtplib
        from email.mime.text import MIMEText

        msg = MIMEText(content, "plain", "utf-8")
        msg["Subject"] = "Re: Sven Studio Message"
        msg["From"] = from_addr
        msg["To"] = chat_id

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, self._send_smtp, smtp_host, smtp_port, smtp_user, smtp_pass, from_addr, chat_id, msg)
        return f"email-{hashlib.md5(content.encode()).hexdigest()[:12]}"

    def _send_smtp(self, host: str, port: int, user: str, pwd: str, from_addr: str, to_addr: str, msg: Any):
        import smtplib
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(user, pwd)
            server.send_message(msg, from_addr=from_addr, to_addrs=[to_addr])

    async def verify_webhook(self, config: dict[str, Any], data: dict[str, Any], headers: dict[str, str]) -> bool:
        # Email doesn't use webhooks; polls via IMAP
        return True

    def parse_webhook(self, data: dict[str, Any]) -> ChannelMessage:
        return ChannelMessage(
            channel_type="email",
            channel_id=data.get("message_id", ""),
            chat_id=data.get("from", ""),
            sender_id=data.get("from", ""),
            sender_name=data.get("from_name", ""),
            content=data.get("body", ""),
            raw_data=data,
        )

    async def poll_inbox(self, config: dict[str, Any]) -> list[ChannelMessage]:
        """Poll IMAP inbox for new messages."""
        imap_host = config.get("imap_host", "")
        imap_port = int(config.get("imap_port", "993"))
        imap_user = config.get("imap_user", "")
        imap_pass = config.get("imap_pass", "")

        if not imap_host or not imap_user:
            return []

        import imaplib
        import email
        from email.header import decode_header

        loop = asyncio.get_event_loop()

        def _fetch():
            messages: list[ChannelMessage] = []
            try:
                import ssl
                ctx = ssl.create_default_context()
                with imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=ctx) as m:
                    m.login(imap_user, imap_pass)
                    m.select("INBOX")
                    _, data = m.search(None, "(UNSEEN)")
                    for num in data[0].split()[-10:]:  # Last 10 unread
                        _, msg_data = m.fetch(num, "(RFC822)")
                        raw = email.message_from_bytes(msg_data[0][1])
                        subject_parts = decode_header(raw["Subject"] or "")
                        subject = ""
                        for part, charset in subject_parts:
                            if isinstance(part, bytes):
                                subject += part.decode(charset or "utf-8", errors="replace")
                            else:
                                subject += part
                        body = ""
                        if raw.is_multipart():
                            for part in raw.walk():
                                if part.get_content_type() == "text/plain":
                                    body = part.get_payload(decode=True).decode("utf-8", errors="replace")
                                    break
                        else:
                            body = raw.get_payload(decode=True).decode("utf-8", errors="replace")
                        messages.append(ChannelMessage(
                            channel_type="email",
                            channel_id=raw.get("Message-ID", ""),
                            chat_id=raw["From"],
                            sender_id=raw["From"],
                            sender_name=raw["From"],
                            content=f"{subject}\n\n{body}",
                            raw_data={"subject": subject},
                        ))
            except Exception as e:
                logger.warning("IMAP poll error: %s", e)
            return messages

        return await loop.run_in_executor(None, _fetch)


# ─── Facebook Messenger ──────────────────────────────────────────────────────

class FacebookChannel(ChannelBase):
    async def send_message(self, config: dict[str, Any], chat_id: str, content: str) -> str:
        page_token = config.get("page_access_token", "")
        if not page_token:
            raise HTTPException(400, "Facebook page_access_token is required")
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"https://graph.facebook.com/v18.0/me/messages",
                params={"access_token": page_token},
                json={
                    "recipient": {"id": chat_id},
                    "message": {"text": content},
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message_id", "")

    async def verify_webhook(self, config: dict[str, Any], data: dict[str, Any], headers: dict[str, str]) -> bool:
        # Facebook verify token check
        verify_token = config.get("verify_token", "")
        if data.get("hub.mode") == "subscribe":
            return data.get("hub.verify_token") == verify_token
        # X-Hub-Signature check
        app_secret = config.get("app_secret", "")
        if app_secret:
            signature = headers.get("x-hub-signature", "")
            expected = f"sha1={hmac.new(app_secret.encode(), json.dumps(data).encode(), hashlib.sha1).hexdigest()}"
            return hmac.compare_digest(signature, expected)
        return True

    def parse_webhook(self, data: dict[str, Any]) -> ChannelMessage:
        entries = data.get("entry", [])
        msg_data = {}
        sender_id = ""
        chat_id = ""
        content = ""
        for entry in entries:
            for msg in entry.get("messaging", []):
                sender_id = msg.get("sender", {}).get("id", "")
                chat_id = msg.get("recipient", {}).get("id", "")
                content = msg.get("message", {}).get("text", "")
                msg_data = msg

        return ChannelMessage(
            channel_type="facebook",
            channel_id=sender_id,
            chat_id=chat_id,
            sender_id=sender_id,
            sender_name=f"fb-{sender_id[:8]}",
            content=content,
            raw_data=msg_data,
        )


# ─── Channel Factory ────────────────────────────────────────────────────────

CHANNEL_CLASSES: dict[str, type[ChannelBase]] = {
    "telegram": TelegramChannel,
    "lark": FeishuChannel,
    "feishu": FeishuChannel,
    "email": EmailChannel,
    "facebook": FacebookChannel,
}


def get_channel(channel_type: str) -> ChannelBase:
    cls = CHANNEL_CLASSES.get(channel_type)
    if not cls:
        raise HTTPException(400, f"Unsupported channel type: {channel_type}")
    return cls()


def parse_config(channel: Channel) -> dict[str, Any]:
    try:
        return json.loads(channel.config_json or "{}")
    except json.JSONDecodeError:
        return {}
