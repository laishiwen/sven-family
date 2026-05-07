from datetime import datetime
import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.database import get_session
from app.models import Prompt
from app.schemas import (
    PromptCreate,
    PromptUpdate,
    PromptResponse,
    PromptsHubItem,
    PromptsHubResponse,
)

router = APIRouter(prefix="/prompts", tags=["Prompts"])


@router.get("", response_model=list[PromptResponse])
async def list_prompts(
    q: str | None = Query(default=None),
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(select(Prompt))
    items = result.all()
    if not q:
        return items

    needle = q.strip().lower()
    if not needle:
        return items

    def matched(item: Prompt) -> bool:
        haystack = " ".join(
            [item.name or "", item.description or "", item.content or ""]
        ).lower()
        return needle in haystack

    return [item for item in items if matched(item)]


@router.get("/tags", response_model=list[str])
async def list_prompt_tags(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Prompt.tags_json))
    all_tags: set[str] = set()

    for raw in result.all():
        try:
            parsed = json.loads(raw or "[]")
        except Exception:
            continue

        if not isinstance(parsed, list):
            continue

        for tag in parsed:
            if isinstance(tag, str):
                normalized = tag.strip()
                if normalized:
                    all_tags.add(normalized)

    return sorted(all_tags)


@router.post("", response_model=PromptResponse, status_code=201)
async def create_prompt(
    body: PromptCreate,
    session: AsyncSession = Depends(get_session),
):
    prompt = Prompt(**body.model_dump())
    session.add(prompt)
    await session.commit()
    await session.refresh(prompt)
    return prompt


# ── Prompts Hub (prompts.chat proxy) – must be before /{prompt_id} ──────────────

PROMPTS_CHAT_API = "https://prompts.chat/api/prompts"


def _extract_content(p: dict) -> str:
    for key in ("content", "prompt", "template", "text"):
        value = p.get(key)
        if isinstance(value, str) and value.strip():
            return value
    return ""


async def _fetch_prompts_chat_api(
    q: str,
    page: int,
    per_page: int,
) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        params = {"q": q, "perPage": per_page, "page": page}
        resp = await client.get(PROMPTS_CHAT_API, params=params)
        resp.raise_for_status()
        return resp.json()


def _to_hub_item(p: dict) -> PromptsHubItem:
    tags = [t.get("name", "") for t in (p.get("tags") or [])]
    return PromptsHubItem(
        id=str(p.get("id", "")),
        title=p.get("title", ""),
        description=p.get("description"),
        content=_extract_content(p),
        tags=tags,
        category=p.get("category", {}).get("name") if p.get("category") else None,
        author=p.get("author", {}).get("username") if p.get("author") else None,
        votes=p.get("voteCount", 0),
        type=p.get("type", "TEXT"),
    )


@router.get("/hub", response_model=PromptsHubResponse)
async def prompts_hub(
    q: str | None = Query(default=None),
    category: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=48, ge=1, le=100),
):
    try:
        data = await _fetch_prompts_chat_api(q=q or "", page=page, per_page=per_page)
    except Exception:
        raise HTTPException(502, "Unable to reach prompts.chat")

    all_prompts = data.get("prompts", [])
    filtered = all_prompts
    if category:
        filtered = [
            p
            for p in filtered
            if (p.get("category") or {}).get("slug", "").lower() == category.lower()
        ]
    if tag:
        filtered = [
            p
            for p in filtered
            if any(
                t.get("slug", "").lower() == tag.lower() for t in (p.get("tags") or [])
            )
        ]

    total = data.get("count", len(filtered))
    page_items = filtered

    if category or tag:
        total = len(filtered)

    return PromptsHubResponse(
        query=q,
        count=total,
        prompts=[_to_hub_item(p) for p in page_items],
    )


@router.get("/search", response_model=PromptsHubResponse)
async def prompts_search(
    q: str = Query(default=""),
    category: str | None = Query(default=None),
    tag: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=48, ge=1, le=100),
):
    try:
        data = await _fetch_prompts_chat_api(q=q, page=page, per_page=per_page)
    except Exception:
        raise HTTPException(502, "Unable to reach prompts.chat")

    all_prompts = data.get("prompts", [])
    filtered = all_prompts
    if category:
        filtered = [
            p
            for p in filtered
            if (p.get("category") or {}).get("slug", "").lower() == category.lower()
        ]
    if tag:
        filtered = [
            p
            for p in filtered
            if any(
                t.get("slug", "").lower() == tag.lower() for t in (p.get("tags") or [])
            )
        ]

    total = data.get("count", len(filtered))
    page_items = filtered

    if category or tag:
        total = len(filtered)

    return PromptsHubResponse(
        query=q,
        count=total,
        prompts=[_to_hub_item(p) for p in page_items],
    )


# ── Individual prompt CRUD ──────────────────────────────────────────────────────


@router.get("/{prompt_id}", response_model=PromptResponse)
async def get_prompt(prompt_id: str, session: AsyncSession = Depends(get_session)):
    prompt = await session.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt not found")
    return prompt


@router.patch("/{prompt_id}", response_model=PromptResponse)
async def update_prompt(
    prompt_id: str,
    body: PromptUpdate,
    session: AsyncSession = Depends(get_session),
):
    prompt = await session.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt not found")

    for key, value in body.model_dump(exclude_none=True).items():
        setattr(prompt, key, value)

    prompt.updated_at = datetime.utcnow()
    session.add(prompt)
    await session.commit()
    await session.refresh(prompt)
    return prompt


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(prompt_id: str, session: AsyncSession = Depends(get_session)):
    prompt = await session.get(Prompt, prompt_id)
    if not prompt:
        raise HTTPException(404, "Prompt not found")

    await session.delete(prompt)
    await session.commit()
