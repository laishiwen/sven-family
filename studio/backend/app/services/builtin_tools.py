from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import unquote, urljoin

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ─── Web Search (free — DuckDuckGo HTML scraping) ────────────────────────────

_DDG_HTML_URL = "https://html.duckduckgo.com/html/"
_DDG_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)


class _DDGResultParser(HTMLParser):
    """Extract title / snippet / url from DuckDuckGo HTML results."""

    def __init__(self):
        super().__init__()
        self.results: list[dict[str, str]] = []
        self._current: dict[str, str] | None = None
        self._text: str = ""
        self._in_link = False
        self._in_snippet = False
        self._link_classes: str = ""

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]):
        attr = dict(attrs)
        cls = (attr.get("class") or "").strip()

        if tag == "a" and "result__a" in cls:
            self._in_link = True
            href = attr.get("href", "")
            # DDG wraps external URLs as //duckduckgo.com/l/?uddg=REAL_URL&...
            self._current = {
                "title": "",
                "url": _extract_ddg_url(href),
                "snippet": "",
            }

        elif tag == "a" and "result__snippet" in cls and self._current:
            self._in_snippet = True
            self._text = ""

    def handle_data(self, data: str):
        if self._in_link and self._current:
            self._current["title"] += data
        elif self._in_snippet:
            self._text += data

    def handle_endtag(self, tag: str):
        if tag == "a" and self._in_link:
            self._in_link = False
        elif tag == "a" and self._in_snippet and self._current:
            self._current["snippet"] = self._text.strip()
            self.results.append(self._current)
            self._current = None
            self._in_snippet = False


def _extract_ddg_url(raw: str) -> str:
    """Extract the real target URL from a DuckDuckGo redirect link."""
    # DDG links look like: //duckduckgo.com/l/?uddg=https://example.com&rut=...
    if "uddg=" in raw:
        m = re.search(r"uddg=([^&]+)", raw)
        if m:
            return unquote(m.group(1))
    # Try relative path
    if raw.startswith("//"):
        raw = "https:" + raw
    return raw


async def _search_ddg_web(query: str, max_results: int = 10) -> list[dict[str, str]]:
    """Search the web using DuckDuckGo HTML (free, no API key required)."""
    headers = {
        "User-Agent": _DDG_USER_AGENT,
        "Content-Type": "application/x-www-form-urlencoded",
    }
    async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
        resp = await client.post(
            _DDG_HTML_URL,
            data={"q": query, "b": ""},
            headers=headers,
        )
        resp.raise_for_status()
        parser = _DDGResultParser()
        parser.feed(resp.text)
        return parser.results[:max_results]


async def execute_web_search(
    input_data: dict[str, Any],
    http_config_json: str = "{}",
) -> dict[str, Any]:
    query = input_data.get("query") or input_data.get("q") or ""
    if not query:
        raise HTTPException(400, "web_search requires 'query' field")

    cfg = {}
    try:
        cfg = json.loads(http_config_json or "{}")
    except json.JSONDecodeError:
        pass

    provider = input_data.get("provider") or cfg.get("provider") or "duckduckgo"
    max_results = int(input_data.get("max_results") or 10)
    max_results = max(1, min(max_results, 20))

    # Route to the appropriate search backend
    if provider == "duckduckgo":
        try:
            results = await _search_ddg_web(query, max_results)
        except httpx.HTTPError as exc:
            logger.warning("DuckDuckGo search failed: %s", exc)
            raise HTTPException(502, f"Web search temporarily unavailable: {exc}")
        instant_answer = ""
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                ia_resp = await client.get(
                    "https://api.duckduckgo.com",
                    params={"q": query, "format": "json", "no_html": 1, "skip_disambig": 1},
                )
                if ia_resp.status_code == 200:
                    ia_data = ia_resp.json()
                    instant_answer = (ia_data.get("AbstractText") or "").strip()
        except Exception:
            pass
        return {
            "provider": provider,
            "query": query,
            "results": results,
            "instant_answer": instant_answer if instant_answer else None,
            "total": len(results),
        }

    # API-based providers (require API keys configured in env vars or settings)
    try:
        from app.services.web_search import search_web
    except ImportError:
        raise HTTPException(400, f"Search provider '{provider}' requires API key configuration. Use 'duckduckgo' for free search.")

    try:
        web_results = await search_web(query, provider=provider)
    except Exception as exc:
        logger.warning("Search provider '%s' failed: %s", provider, exc)
        raise HTTPException(502, f"Search provider '{provider}' failed: {exc}")

    return {
        "provider": provider,
        "query": query,
        "results": web_results[:max_results] if isinstance(web_results, list) else [],
        "total": len(web_results) if isinstance(web_results, list) else 0,
    }


# ─── File I/O ────────────────────────────────────────────────────────────────

_DEFAULT_WORKSPACE = os.path.expanduser("~")

def _resolve_workspace(cfg: dict[str, Any]) -> Path:
    workspace = cfg.get("workspace_root") or os.getenv("SVEN_WORKSPACE_ROOT") or _DEFAULT_WORKSPACE
    return Path(workspace).resolve()


def _safe_path(workspace: Path, filepath: str) -> Path:
    """Resolve and validate that filepath is within workspace."""
    p = (workspace / filepath).resolve()
    if not str(p).startswith(str(workspace)):
        raise HTTPException(403, f"Path traversal denied: {filepath}")
    return p


async def execute_file_io(input_data: dict[str, Any], http_config_json: str = "{}") -> dict[str, Any]:
    cfg = {}
    try:
        cfg = json.loads(http_config_json or "{}")
    except json.JSONDecodeError:
        pass

    # Allow input_data to override workspace_root (injected by agent runtime)
    if input_data.get("workspace_root"):
        cfg["workspace_root"] = input_data["workspace_root"]
    workspace = _resolve_workspace(cfg)
    operation = input_data.get("operation") or input_data.get("action") or "read"
    filepath = input_data.get("filepath") or input_data.get("path") or input_data.get("file") or ""

    if not filepath:
        raise HTTPException(400, "file_io requires 'filepath'")

    target = _safe_path(workspace, filepath)

    if operation == "read":
        if not target.exists():
            raise HTTPException(404, f"File not found: {filepath}")
        content = target.read_text(encoding="utf-8", errors="replace")
        truncated = len(content) > 50_000
        if truncated:
            content = content[:50_000] + "\n\n[... truncated, file too large ...]"
        return {
            "operation": "read",
            "filepath": str(target.relative_to(workspace)),
            "content": content,
            "size": len(content),
            "truncated": truncated,
        }

    if operation in ("write", "create"):
        content = input_data.get("content") or input_data.get("data") or ""
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(str(content), encoding="utf-8")
        return {
            "operation": "write",
            "filepath": str(target.relative_to(workspace)),
            "size": len(str(content)),
        }

    if operation == "list":
        if not target.exists() or not target.is_dir():
            raise HTTPException(400, f"Not a directory: {filepath}")
        entries = []
        for entry in sorted(target.iterdir()):
            entries.append({
                "name": entry.name,
                "type": "directory" if entry.is_dir() else "file",
                "size": entry.stat().st_size if entry.is_file() else None,
            })
        return {
            "operation": "list",
            "filepath": str(target.relative_to(workspace)),
            "entries": entries,
            "total": len(entries),
        }

    if operation == "delete":
        if not target.exists():
            raise HTTPException(404, f"File not found: {filepath}")
        if target.is_dir():
            import shutil
            shutil.rmtree(target)
        else:
            target.unlink()
        return {"operation": "delete", "filepath": str(target.relative_to(workspace))}

    raise HTTPException(400, f"Unsupported file_io operation: {operation}. Use: read | write | list | delete")


# ─── CLI ─────────────────────────────────────────────────────────────────────

_CLI_TIMEOUT = 60  # default 60s max for CLI commands


async def execute_cli(input_data: dict[str, Any], http_config_json: str = "{}") -> dict[str, Any]:
    cfg = {}
    try:
        cfg = json.loads(http_config_json or "{}")
    except json.JSONDecodeError:
        pass

    command = input_data.get("command") or input_data.get("cmd") or ""
    if not command:
        raise HTTPException(400, "cli requires 'command' field")

    timeout = int(input_data.get("timeout") or cfg.get("timeout", _CLI_TIMEOUT))
    cwd = input_data.get("cwd") or cfg.get("cwd") or os.getcwd()
    env = os.environ.copy()
    env.update(cfg.get("env", {}))

    try:
        proc = await asyncio.create_subprocess_shell(
            command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
            env=env,
        )
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        out_text = stdout.decode("utf-8", errors="replace")
        err_text = stderr.decode("utf-8", errors="replace")

        out_truncated = len(out_text) > 20_000
        if out_truncated:
            out_text = out_text[:20_000] + "\n\n[... stdout truncated, too long ...]"
        err_truncated = len(err_text) > 5_000
        if err_truncated:
            err_text = err_text[:5_000] + "\n\n[... stderr truncated, too long ...]"

        return {
            "stdout": out_text.strip(),
            "stderr": err_text.strip(),
            "returncode": proc.returncode,
            "truncated": out_truncated or err_truncated,
        }
    except asyncio.TimeoutError:
        raise HTTPException(504, f"CLI command timed out after {timeout}s")
    except Exception as exc:
        raise HTTPException(500, f"CLI execution error: {exc}")


# ─── Builtin tool seed data ──────────────────────────────────────────────────

BUILTIN_TOOLS = [
    {
        "id": "builtin-web-search",
        "name": "Web Search",
        "description": "Search the web. Supports DuckDuckGo (free), SerpAPI, Tavily, Brave (API keys required).",
        "tool_type": "web_search",
        "parameters_schema_json": json.dumps({
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "provider": {"type": "string", "enum": ["duckduckgo", "serpapi", "tavily", "brave"], "default": "duckduckgo", "description": "Search engine: duckduckgo (free), serpapi, tavily, brave"},
                "max_results": {"type": "integer", "default": 10, "minimum": 1, "maximum": 20},
            },
            "required": ["query"],
        }),
        "http_config_json": json.dumps({
            "provider": "duckduckgo",
            "description": "DuckDuckGo is free. SerpAPI/Tavily/Brave need API keys in env vars (SEARCH_SERPAPI_KEY, SEARCH_TAVILY_API_KEY, SEARCH_BRAVE_API_KEY).",
        }),
        "is_builtin": True,
    },
    {
        "id": "builtin-file-io",
        "name": "File I/O",
        "description": "Read, write, list, and delete files within the workspace directory.",
        "tool_type": "file_io",
        "parameters_schema_json": json.dumps({
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["read", "write", "list", "delete"]},
                "filepath": {"type": "string", "description": "Relative path within workspace"},
                "content": {"type": "string", "description": "Content to write (required for write operation)"},
            },
            "required": ["operation", "filepath"],
        }),
        "http_config_json": json.dumps({
            "workspace_root": os.path.expanduser("~"),
            "description": "Set SVEN_WORKSPACE_ROOT env var to restrict the workspace directory.",
        }),
        "is_builtin": True,
    },
    {
        "id": "builtin-cli",
        "name": "System CLI",
        "description": "Execute shell commands on the local system.",
        "tool_type": "cli",
        "parameters_schema_json": json.dumps({
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "Shell command to execute"},
                "timeout": {"type": "integer", "default": 60, "maximum": 300},
                "cwd": {"type": "string", "description": "Working directory"},
            },
            "required": ["command"],
        }),
        "http_config_json": json.dumps({"timeout": 60}),
        "is_builtin": True,
    },
]
