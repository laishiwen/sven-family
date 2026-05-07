"""WebDAV backup/sync service."""

from __future__ import annotations

import asyncio
import logging
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from xml.etree import ElementTree as ET

logger = logging.getLogger(__name__)

WEBDAV_NS = {"d": "DAV:"}


@dataclass
class WebDAVConfig:
    url: str
    username: str = ""
    password: str = ""
    timeout: int = 30


def _headers(config: WebDAVConfig) -> dict[str, str]:
    import base64
    headers = {}
    if config.username:
        credentials = base64.b64encode(f"{config.username}:{config.password}".encode()).decode()
        headers["Authorization"] = f"Basic {credentials}"
    return headers


async def webdav_list(config: WebDAVConfig, path: str = "/") -> list[dict[str, Any]]:
    """List files in a WebDAV directory."""
    url = f"{config.url.rstrip('/')}{path}"
    body = """<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"""

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        resp = await client.request(
            "PROPFIND", url, headers=_headers(config), content=body,
        )
        resp.raise_for_status()
        root = ET.fromstring(resp.content)
        items = []
        for response in root.findall("d:response", WEBDAV_NS):
            href = (response.findtext("d:href", "", WEBDAV_NS) or "").rstrip("/")
            prop = response.find("d:propstat/d:prop", WEBDAV_NS)
            if prop is None:
                continue
            displayname = prop.findtext("d:displayname", "", WEBDAV_NS)
            size = prop.findtext("d:getcontentlength", "0", WEBDAV_NS)
            modified = prop.findtext("d:getlastmodified", "", WEBDAV_NS)
            is_dir = prop.find("d:resourcetype/d:collection", WEBDAV_NS) is not None

            # Skip the directory itself
            if href.split("/")[-1] == path.rstrip("/").split("/")[-1]:
                continue

            items.append({
                "name": displayname or href.split("/")[-1],
                "path": href,
                "size": int(size) if not is_dir else 0,
                "is_directory": is_dir,
                "modified": modified,
            })
        return items


async def webdav_upload(config: WebDAVConfig, remote_path: str, local_path: str | Path) -> dict[str, Any]:
    """Upload a local file to WebDAV."""
    local = Path(local_path)
    if not local.exists():
        raise FileNotFoundError(f"Local file not found: {local_path}")

    url = f"{config.url.rstrip('/')}/{remote_path.lstrip('/')}"
    content = local.read_bytes()

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        resp = await client.put(url, headers=_headers(config), content=content)
        resp.raise_for_status()
        return {"status": "uploaded", "path": remote_path, "size": len(content)}


async def webdav_download(config: WebDAVConfig, remote_path: str, local_path: str | Path) -> dict[str, Any]:
    """Download a file from WebDAV to local path."""
    url = f"{config.url.rstrip('/')}/{remote_path.lstrip('/')}"
    local = Path(local_path)

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        resp = await client.get(url, headers=_headers(config))
        resp.raise_for_status()
        local.parent.mkdir(parents=True, exist_ok=True)
        local.write_bytes(resp.content)
        return {"status": "downloaded", "path": str(local), "size": len(resp.content)}


async def webdav_delete(config: WebDAVConfig, remote_path: str) -> dict[str, Any]:
    """Delete a file or directory on WebDAV."""
    url = f"{config.url.rstrip('/')}/{remote_path.lstrip('/')}"

    async with httpx.AsyncClient(timeout=config.timeout) as client:
        resp = await client.delete(url, headers=_headers(config))
        resp.raise_for_status()
        return {"status": "deleted", "path": remote_path}


async def webdav_backup_db(config: WebDAVConfig, db_path: str, backup_prefix: str = "sven-studio-backup") -> dict[str, Any]:
    """Back up the SQLite database to WebDAV with timestamp."""
    from datetime import datetime
    timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    remote_name = f"{backup_prefix}_{timestamp}.db"
    return await webdav_upload(config, remote_name, db_path)
