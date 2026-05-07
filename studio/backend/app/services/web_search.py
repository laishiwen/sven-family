from __future__ import annotations

from typing import Any

import httpx

from app.core.config import settings


async def _search_tavily(query: str) -> list[dict[str, str]]:
    if not settings.SEARCH_TAVILY_API_KEY:
        return []
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://api.tavily.com/search",
            json={
                "api_key": settings.SEARCH_TAVILY_API_KEY,
                "query": query,
                "search_depth": "basic",
                "max_results": 5,
            },
        )
        response.raise_for_status()
        data = response.json()
        return [
            {
                "title": item.get("title") or item.get("url") or "Untitled",
                "url": item.get("url") or "",
                "snippet": item.get("content") or "",
            }
            for item in data.get("results", [])
        ]


async def _search_brave(query: str) -> list[dict[str, str]]:
    if not settings.SEARCH_BRAVE_API_KEY:
        return []
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            "https://api.search.brave.com/res/v1/web/search",
            params={"q": query, "count": 5},
            headers={"X-Subscription-Token": settings.SEARCH_BRAVE_API_KEY},
        )
        response.raise_for_status()
        data = response.json()
        return [
            {
                "title": item.get("title") or item.get("url") or "Untitled",
                "url": item.get("url") or "",
                "snippet": item.get("description") or "",
            }
            for item in data.get("web", {}).get("results", [])
        ]


async def _search_serpapi(query: str) -> list[dict[str, str]]:
    if not settings.SEARCH_SERPAPI_KEY:
        return []
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            "https://serpapi.com/search.json",
            params={
                "q": query,
                "api_key": settings.SEARCH_SERPAPI_KEY,
                "num": 5,
                "engine": "google",
            },
        )
        response.raise_for_status()
        data = response.json()
        return [
            {
                "title": item.get("title") or item.get("link") or "Untitled",
                "url": item.get("link") or "",
                "snippet": item.get("snippet") or "",
            }
            for item in data.get("organic_results", [])
        ]


async def _search_duckduckgo(query: str) -> list[dict[str, str]]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.get(
            "https://api.duckduckgo.com/",
            params={"q": query, "format": "json", "no_redirect": 1, "no_html": 1},
        )
        response.raise_for_status()
        data: dict[str, Any] = response.json()
        results: list[dict[str, str]] = []
        if data.get("AbstractText"):
            results.append(
                {
                    "title": data.get("Heading") or query,
                    "url": data.get("AbstractURL") or "",
                    "snippet": data.get("AbstractText") or "",
                }
            )
        for topic in data.get("RelatedTopics", [])[:5]:
            if "Text" in topic:
                results.append(
                    {
                        "title": topic.get("FirstURL", query),
                        "url": topic.get("FirstURL") or "",
                        "snippet": topic.get("Text") or "",
                    }
                )
            for nested in topic.get("Topics", [])[:5]:
                results.append(
                    {
                        "title": nested.get("FirstURL", query),
                        "url": nested.get("FirstURL") or "",
                        "snippet": nested.get("Text") or "",
                    }
                )
        return results[:5]


async def search_web(query: str, provider: str | None = None) -> list[dict[str, str]]:
    provider_name = (provider or settings.SEARCH_DEFAULT_PROVIDER or "duckduckgo").lower()
    try:
        if provider_name == "tavily":
            results = await _search_tavily(query)
            if results:
                return results
        elif provider_name == "brave":
            results = await _search_brave(query)
            if results:
                return results
        elif provider_name == "serpapi":
            results = await _search_serpapi(query)
            if results:
                return results
    except Exception:
        pass
    return await _search_duckduckgo(query)