"""Generic OpenAI-compatible LLM client for streaming chat and health checks."""

from __future__ import annotations

import asyncio
import atexit
import json
import logging
from typing import Any, AsyncGenerator

import httpx

logger = logging.getLogger(__name__)

# ── Shared connection pool ────────────────────────────────────────────────────

_shared_client: httpx.AsyncClient | None = None
_client_lock = asyncio.Lock()


def _get_client() -> httpx.AsyncClient:
    """Lazy-init a shared httpx client with connection pooling and HTTP/2."""
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120, connect=30),
            limits=httpx.Limits(max_keepalive_connections=30, max_connections=100),
        )
    return _shared_client


async def _close_client():
    global _shared_client
    if _shared_client and not _shared_client.is_closed:
        await _shared_client.aclose()
        _shared_client = None


# Close on process exit so connections don't leak
atexit.register(lambda: asyncio.get_event_loop().run_until_complete(_close_client()) if _shared_client else None)


# ── URL helpers ──────────────────────────────────────────────────────────────

def _chat_completions_url(api_base: str | None) -> str:
    base = (api_base or "https://api.openai.com/v1").rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _ollama_chat_url(api_base: str | None) -> str:
    base = (api_base or "http://localhost:11434").rstrip("/")
    if base.endswith("/v1"):
        base = base[: -len("/v1")]
    if base.endswith("/api"):
        return f"{base}/chat"
    return f"{base}/api/chat"


def _embeddings_url(api_base: str | None) -> str:
    base = (api_base or "https://api.openai.com/v1").rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/embeddings"
    return f"{base}/v1/embeddings"


def _headers(api_key: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def _use_ollama_native(provider_type: str | None, api_base: str | None) -> bool:
    if (provider_type or "").lower() == "ollama":
        return True
    if not api_base:
        return False
    return "11434" in api_base.lower() or "ollama" in api_base.lower()


def _is_anthropic(provider_type: str | None) -> bool:
    return (provider_type or "").lower() == "anthropic"


def _is_gemini(provider_type: str | None) -> bool:
    return (provider_type or "").lower() in ("google", "gemini", "google_gemini")


# ── Streaming ────────────────────────────────────────────────────────────────

async def llm_chat_events(
    model: str,
    messages: list,
    api_key: str | None = None,
    api_base: str | None = None,
    provider_type: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    **kwargs: Any,
) -> AsyncGenerator[str, None]:
    """Yield raw SSE data payloads from an OpenAI-compatible chat completions endpoint."""
    client = _get_client()

    if _use_ollama_native(provider_type, api_base):
        payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True}
        think = kwargs.get("think")
        if isinstance(think, bool):
            payload["think"] = think
        options: dict[str, Any] = {}
        if temperature is not None:
            options["temperature"] = temperature
        if max_tokens:
            options["num_predict"] = max_tokens
        if options:
            payload["options"] = options
        url = _ollama_chat_url(api_base)
        async with client.stream("POST", url, headers=_headers(api_key), json=payload) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if obj.get("done"):
                    yield "[DONE]"
                    break
                message = obj.get("message") or {}
                reasoning = message.get("reasoning") or message.get("thinking")
                content = message.get("content")
                if isinstance(reasoning, str) and reasoning:
                    yield json.dumps({"choices": [{"delta": {"reasoning": reasoning}}]}, ensure_ascii=False)
                if isinstance(content, str) and content:
                    yield json.dumps({"choices": [{"delta": {"content": content}}]}, ensure_ascii=False)
        return

    if _is_anthropic(provider_type):
        async for data in _anthropic_stream(model, messages, api_key, api_base, temperature, max_tokens, **kwargs):
            yield data
        return

    if _is_gemini(provider_type):
        async for data in _gemini_stream(model, messages, api_key, temperature, max_tokens, **kwargs):
            yield data
        return

    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": True, "temperature": temperature, **kwargs}
    if max_tokens:
        payload["max_tokens"] = max_tokens

    url = _chat_completions_url(api_base)
    async with client.stream("POST", url, headers=_headers(api_key), json=payload) as response:
        response.raise_for_status()
        async for line in response.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            yield line[len("data:"):].strip()


# ── Non-streaming ────────────────────────────────────────────────────────────

async def llm_chat(
    model: str,
    messages: list,
    api_key: str | None = None,
    api_base: str | None = None,
    provider_type: str | None = None,
    temperature: float = 0.7,
    max_tokens: int | None = None,
    **kwargs: Any,
) -> AsyncGenerator[str, None]:
    """Stream chat completions from an OpenAI-compatible API endpoint."""
    try:
        async for data in llm_chat_events(
            model, messages,
            api_key=api_key, api_base=api_base, provider_type=provider_type,
            temperature=temperature, max_tokens=max_tokens, **kwargs,
        ):
            if data == "[DONE]":
                break
            try:
                obj = json.loads(data)
            except json.JSONDecodeError:
                continue
            choices = obj.get("choices") or []
            if not choices:
                continue
            delta = choices[0].get("delta") or {}
            content = delta.get("content")
            if content:
                yield content
    except Exception as exc:
        logger.warning("LLM stream error (model=%s, base=%s): %s", model, api_base, exc)
        async for token in _mock_stream(model, error=str(exc)):
            yield token


async def check_model_health(
    model: str,
    api_key: str | None = None,
    api_base: str | None = None,
) -> dict[str, str]:
    """Quick health check using a minimal non-stream chat completion call."""
    client = _get_client()
    url = _chat_completions_url(api_base)
    payload = {"model": model, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1, "stream": False}
    try:
        response = await client.post(url, headers=_headers(api_key), json=payload, timeout=10)
        response.raise_for_status()
        return {"status": "healthy"}
    except Exception as exc:
        return {"status": "unhealthy", "error": str(exc)[:200]}


async def llm_complete_text(
    model: str,
    messages: list[dict[str, Any]],
    api_key: str | None = None,
    api_base: str | None = None,
    provider_type: str | None = None,
    temperature: float = 0.2,
    max_tokens: int = 150,
    **kwargs: Any,
) -> str:
    """Run a non-stream chat completion and return plain text."""
    client = _get_client()

    if _is_anthropic(provider_type):
        return await _anthropic_complete(model, messages, api_key, api_base, temperature, max_tokens, **kwargs)
    if _is_gemini(provider_type):
        return await _gemini_complete(model, messages, api_key, temperature, max_tokens, **kwargs)

    if _use_ollama_native(provider_type, api_base):
        payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False}
        options: dict[str, Any] = {}
        if temperature is not None:
            options["temperature"] = temperature
        if max_tokens:
            options["num_predict"] = max_tokens
        if options:
            payload["options"] = options
        if "think" in kwargs and isinstance(kwargs["think"], bool):
            payload["think"] = kwargs["think"]
        url = _ollama_chat_url(api_base)
        response = await client.post(url, headers=_headers(api_key), json=payload, timeout=30)
        response.raise_for_status()
        data = response.json()
        message = data.get("message") or {}
        content = message.get("content")
        return content if isinstance(content, str) else ""

    payload: dict[str, Any] = {"model": model, "messages": messages, "stream": False, "temperature": temperature, "max_tokens": max_tokens, **kwargs}
    url = _chat_completions_url(api_base)
    response = await client.post(url, headers=_headers(api_key), json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    choices = data.get("choices") or []
    if not choices:
        return ""
    message = choices[0].get("message") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [item["text"] for item in content if isinstance(item, dict) and isinstance(item.get("text"), str)]
        return "".join(parts)
    return ""


async def llm_embed(
    model: str,
    text: str,
    api_key: str | None = None,
    api_base: str | None = None,
) -> list[float]:
    """Get a single embedding vector from an OpenAI-compatible embeddings API."""
    client = _get_client()
    url = _embeddings_url(api_base)
    payload = {"model": model, "input": [text]}
    response = await client.post(url, headers=_headers(api_key), json=payload, timeout=30)
    response.raise_for_status()
    data = response.json()
    rows = data.get("data") or []
    if not rows:
        raise ValueError("Empty embedding response")
    vector = rows[0].get("embedding")
    if not isinstance(vector, list):
        raise ValueError("Invalid embedding response shape")
    return [float(value) for value in vector]


# ─── Anthropic Native ────────────────────────────────────────────────────────

def _anthropic_messages_url(api_base: str | None) -> str:
    base = (api_base or "https://api.anthropic.com").rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/messages"
    return f"{base}/v1/messages"


def _anthropic_headers(api_key: str | None) -> dict[str, str]:
    return {"Content-Type": "application/json", "x-api-key": api_key or "", "anthropic-version": "2023-06-01"}


async def _anthropic_stream(
    model: str, messages: list, api_key: str | None, api_base: str | None,
    temperature: float = 0.7, max_tokens: int | None = None, **kwargs: Any,
) -> AsyncGenerator[str, None]:
    client = _get_client()
    system_prompt = ""
    user_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system_prompt = msg.get("content", "")
        else:
            user_messages.append({"role": msg.get("role"), "content": msg.get("content", "")})

    payload: dict[str, Any] = {"model": model or "claude-sonnet-4-6", "messages": user_messages, "max_tokens": max_tokens or 4096, "temperature": temperature, "stream": True}
    if system_prompt:
        payload["system"] = system_prompt

    url = _anthropic_messages_url(api_base)
    async with client.stream("POST", url, headers=_anthropic_headers(api_key), json=payload, timeout=120) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data_str = line[len("data:"):].strip()
            if data_str == "[DONE]":
                yield "[DONE]"
                return
            try:
                obj = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            t = obj.get("type", "")
            if t == "content_block_delta":
                delta = obj.get("delta", {})
                text = delta.get("text", "")
                if text:
                    yield json.dumps({"choices": [{"delta": {"content": text}}]}, ensure_ascii=False)
            elif t == "message_stop":
                yield "[DONE]"
                return


async def _anthropic_complete(
    model: str, messages: list, api_key: str | None, api_base: str | None,
    temperature: float = 0.2, max_tokens: int | None = None, **kwargs: Any,
) -> str:
    client = _get_client()
    system_prompt = ""
    user_messages = []
    for msg in messages:
        if msg.get("role") == "system":
            system_prompt = msg.get("content", "")
        else:
            user_messages.append({"role": msg.get("role"), "content": msg.get("content", "")})

    payload: dict[str, Any] = {"model": model or "claude-sonnet-4-6", "messages": user_messages, "max_tokens": max_tokens or 4096, "temperature": temperature}
    if system_prompt:
        payload["system"] = system_prompt

    url = _anthropic_messages_url(api_base)
    resp = await client.post(url, headers=_anthropic_headers(api_key), json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    for block in data.get("content", []):
        if block.get("type") == "text":
            return block.get("text", "")
    return ""


# ─── Google Gemini Native ───────────────────────────────────────────────────

def _gemini_url(model: str, api_key: str | None) -> str:
    key = api_key or ""
    return f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse&key={key}"


def _gemini_format_messages(messages: list) -> tuple[list, list]:
    contents, system_parts = [], []
    for msg in messages:
        role = msg.get("role", "user")
        content = msg.get("content", "")
        if role == "system":
            system_parts.append({"text": content})
        else:
            gemini_role = "model" if role == "assistant" else "user"
            contents.append({"role": gemini_role, "parts": [{"text": content}]})
    if not contents:
        contents = [{"role": "user", "parts": [{"text": "Hello"}]}]
    return contents, system_parts


async def _gemini_stream(
    model: str, messages: list, api_key: str | None,
    temperature: float = 0.7, max_tokens: int | None = None, **kwargs: Any,
) -> AsyncGenerator[str, None]:
    client = _get_client()
    contents, system_parts = _gemini_format_messages(messages)
    payload: dict[str, Any] = {"contents": contents, "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens or 4096}}
    if system_parts:
        payload["systemInstruction"] = {"parts": system_parts}

    url = _gemini_url(model, api_key)
    async with client.stream("POST", url, json=payload, timeout=120) as resp:
        resp.raise_for_status()
        async for line in resp.aiter_lines():
            if not line or not line.startswith("data:"):
                continue
            data_str = line[len("data:"):].strip()
            try:
                obj = json.loads(data_str)
            except json.JSONDecodeError:
                continue
            for c in obj.get("candidates", []):
                for part in c.get("content", {}).get("parts", []):
                    text = part.get("text", "")
                    if text:
                        yield json.dumps({"choices": [{"delta": {"content": text}}]}, ensure_ascii=False)


async def _gemini_complete(
    model: str, messages: list, api_key: str | None,
    temperature: float = 0.2, max_tokens: int | None = None, **kwargs: Any,
) -> str:
    client = _get_client()
    contents, system_parts = _gemini_format_messages(messages)
    url = _gemini_url(model, api_key).replace(":streamGenerateContent", ":generateContent").replace("&alt=sse", "")
    payload: dict[str, Any] = {"contents": contents, "generationConfig": {"temperature": temperature, "maxOutputTokens": max_tokens or 4096}}
    if system_parts:
        payload["systemInstruction"] = {"parts": system_parts}

    resp = await client.post(url, json=payload, timeout=60)
    resp.raise_for_status()
    data = resp.json()
    for c in data.get("candidates", []):
        for part in c.get("content", {}).get("parts", []):
            text = part.get("text", "")
            if text:
                return text
    return ""


# ─── Mock stream ─────────────────────────────────────────────────────────────

async def _mock_stream(model: str, error: str | None = None):
    """Word-by-word mock streaming for development."""
    if error:
        text = f"[模拟回复] 调用模型 `{model}` 失败: {error[:120]}\n\n请在 **LLM 管理** 页面配置正确的 API Key、Base URL 和模型 ID。"
    else:
        text = f"[模拟回复] 我已收到您的消息。当前模型: `{model}`。\n\n这是开发模式的模拟响应。请在 **LLM 管理** 页面添加提供商并配置 API Key，即可启用真实模型调用。"
    for word in text.split(" "):
        yield word + " "
        await asyncio.sleep(0.04)
