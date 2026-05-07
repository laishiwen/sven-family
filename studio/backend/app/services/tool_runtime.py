from __future__ import annotations

import asyncio
import json
import re
from typing import Any

import httpx
from fastapi import HTTPException

from app.models import Tool
from app.services.builtin_tools import execute_web_search, execute_file_io, execute_cli


async def execute_tool(tool: Tool, input_data: dict[str, Any]) -> dict[str, Any]:
    """Execute a Tool model with the given input payload."""
    tool_type = tool.tool_type or "python"

    if tool_type == "web_search":
        return await execute_web_search(input_data, tool.http_config_json)

    if tool_type == "file_io":
        return await execute_file_io(input_data, tool.http_config_json)

    if tool_type == "cli":
        return await execute_cli(input_data, tool.http_config_json)

    if tool_type == "python":
        if not tool.code_content:
            raise HTTPException(400, "Tool has no Python code")
        try:
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                _run_python_code,
                tool.code_content,
                input_data,
            )
            return result
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"Tool execution error: {exc}") from exc

    if tool_type == "http":
        try:
            cfg = json.loads(tool.http_config_json or "{}")
            timeout = float(cfg.get("timeout", 30))
            standard = (cfg.get("standard") or "generic").lower()
            rendered_cfg = _render_value(cfg, input_data)

            if standard == "openai":
                method, url, headers, params, body = _build_openai_request(
                    rendered_cfg,
                    input_data,
                )
            else:
                url = rendered_cfg.get("url", "")
                method = str(rendered_cfg.get("method", "POST")).upper()
                headers = rendered_cfg.get("headers", {}) or {}
                params = rendered_cfg.get("params", {}) or {}
                body = rendered_cfg.get(
                    "body_template",
                    rendered_cfg.get("body", {}),
                )

            if not url:
                raise HTTPException(400, "HTTP tool config missing url/base_url")

            request_kwargs: dict[str, Any] = {
                "headers": headers,
                "params": params,
            }
            payload_mode = (rendered_cfg.get("payload_mode") or "json").lower()
            if method not in {"GET", "DELETE", "HEAD"}:
                if payload_mode == "text":
                    request_kwargs["content"] = (
                        body if isinstance(body, str) else json.dumps(body)
                    )
                elif payload_mode == "form":
                    request_kwargs["data"] = body
                else:
                    request_kwargs["json"] = body

            async with httpx.AsyncClient(timeout=timeout) as client:
                resp = await client.request(method, url, **request_kwargs)
                resp.raise_for_status()
                try:
                    data = resp.json()
                    if standard == "openai":
                        return _normalize_openai_response(data, rendered_cfg)
                    return {
                        "status_code": resp.status_code,
                        "data": data,
                    }
                except Exception:
                    return {
                        "status_code": resp.status_code,
                        "result": resp.text,
                    }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(500, f"HTTP tool error: {exc}") from exc

    raise HTTPException(400, f"Unsupported tool type: {tool_type}")


def _run_python_code(code: str, input_data: dict[str, Any]) -> dict[str, Any]:
    namespace: dict[str, Any] = {}
    try:
        exec(compile(code, "<tool>", "exec"), namespace)  # noqa: S102
    except Exception as exc:
        raise RuntimeError(f"Code compilation error: {exc}") from exc

    run_fn = namespace.get("run")
    if not callable(run_fn):
        raise RuntimeError("Tool code must define a callable 'run(input: dict) -> dict' function")

    result = run_fn(input_data)
    if not isinstance(result, dict):
        result = {"result": result}
    return result


_TEMPLATE_RE = re.compile(r"\{\{\s*([\w.]+)\s*\}\}")


def _resolve_input_value(values: dict[str, Any], path: str):
    current: Any = values
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return None
    return current


def _render_string(value: str, variables: dict[str, Any]):
    matches = list(_TEMPLATE_RE.finditer(value))
    if not matches:
        return value

    if len(matches) == 1 and matches[0].span() == (0, len(value)):
        resolved = _resolve_input_value(variables, matches[0].group(1))
        return resolved if resolved is not None else value

    def _replace(match: re.Match[str]) -> str:
        resolved = _resolve_input_value(variables, match.group(1))
        if resolved is None:
            return match.group(0)
        if isinstance(resolved, (dict, list)):
            return json.dumps(resolved, ensure_ascii=False)
        return str(resolved)

    return _TEMPLATE_RE.sub(_replace, value)


def _render_value(value: Any, variables: dict[str, Any]):
    if isinstance(value, dict):
        return {key: _render_value(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [_render_value(item, variables) for item in value]
    if isinstance(value, str):
        return _render_string(value, variables)
    return value


def _build_openai_request(cfg: dict[str, Any], input_data: dict[str, Any]) -> tuple[str, str, dict[str, Any], dict[str, Any], dict[str, Any]]:
    operation = str(cfg.get("operation") or "chat.completions").lower()
    endpoint_defaults = {
        "chat.completions": "/v1/chat/completions",
        "responses": "/v1/responses",
        "embeddings": "/v1/embeddings",
    }
    base_url = str(cfg.get("base_url") or "https://api.openai.com").rstrip("/")
    endpoint_path = str(
        cfg.get("endpoint_path") or endpoint_defaults.get(operation, "/v1/chat/completions")
    )
    url = endpoint_path if endpoint_path.startswith("http") else f"{base_url}{endpoint_path}"
    api_key = cfg.get("api_key") or input_data.get("api_key")

    headers = {
        "Content-Type": "application/json",
        **(cfg.get("headers", {}) or {}),
    }
    if api_key:
        headers.setdefault("Authorization", f"Bearer {api_key}")

    model = input_data.get("model") or cfg.get("model")
    if not model:
        raise HTTPException(400, "OpenAI-compatible HTTP tool requires model")

    if operation == "responses":
        body = {
            "model": model,
            "input": input_data.get("input") or input_data.get("message") or "",
        }
    elif operation == "embeddings":
        body = {
            "model": model,
            "input": input_data.get("input")
            or input_data.get("text")
            or input_data.get("message")
            or "",
        }
    else:
        messages = input_data.get("messages")
        if not isinstance(messages, list):
            messages = []
            system_prompt = input_data.get("system_prompt") or cfg.get("system_prompt")
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            user_message = (
                input_data.get("message")
                or input_data.get("input")
                or input_data.get("prompt")
                or ""
            )
            if user_message:
                messages.append({"role": "user", "content": user_message})

        body = {
            "model": model,
            "messages": messages,
        }
        if cfg.get("temperature") is not None:
            body["temperature"] = cfg.get("temperature")
        if cfg.get("max_tokens") is not None:
            body["max_tokens"] = cfg.get("max_tokens")

    extra_body = cfg.get("body_template") or cfg.get("extra_body") or {}
    if isinstance(extra_body, dict):
        body.update(extra_body)

    params = cfg.get("params", {}) or {}
    return "POST", url, headers, params, body


def _normalize_openai_response(data: dict[str, Any], cfg: dict[str, Any]) -> dict[str, Any]:
    operation = str(cfg.get("operation") or "chat.completions").lower()

    if operation == "embeddings":
        embedding = None
        if isinstance(data.get("data"), list) and data["data"]:
            embedding = data["data"][0].get("embedding")
        return {
            "embedding": embedding,
            "raw": data,
        }

    if operation == "responses":
        output_text = data.get("output_text")
        if not output_text:
            outputs = data.get("output") or []
            parts: list[str] = []
            for item in outputs:
                for content in item.get("content", []):
                    text = content.get("text")
                    if text:
                        parts.append(text)
            output_text = "\n".join(parts).strip()
        return {
            "output_text": output_text,
            "raw": data,
        }

    message_content = None
    choices = data.get("choices") or []
    if choices:
        message = choices[0].get("message") or {}
        message_content = message.get("content")
    return {
        "output_text": message_content,
        "raw": data,
    }