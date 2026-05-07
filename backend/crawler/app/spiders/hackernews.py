import logging
import httpx
from app.config import settings
from app.spiders.base import BaseSpider, Article
from app.extractor import extract_article
from app.dedup import is_duplicate

logger = logging.getLogger("crawler.spiders.hackernews")

_API_BASE = "https://hacker-news.firebaseio.com/v0"
_ITEM_URL = "https://news.ycombinator.com/item?id={}"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
}


class HackerNewsSpider(BaseSpider):
    name = "hackernews"
    schedule = settings.spider_hackernews_schedule
    source_name = "Hacker News"

    async def fetch(self):
        articles = []
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        async with httpx.AsyncClient(
            timeout=30, headers=_HEADERS, follow_redirects=True, limits=limits,
        ) as client:
            # 1. Get top story IDs
            logger.info("Fetching top story IDs from Hacker News API")
            resp = await client.get(f"{_API_BASE}/topstories.json")
            resp.raise_for_status()
            max_stories = settings.spider_max_articles_per_run
            story_ids = resp.json()[: max_stories + 5]

            for story_id in story_ids:
                try:
                    # 2. Fetch story details
                    item_resp = await client.get(
                        f"{_API_BASE}/item/{story_id}.json"
                    )
                    item_resp.raise_for_status()
                    story = item_resp.json()
                    if not story:
                        continue

                    title = story.get("title", "")
                    url = story.get("url", "")
                    hn_url = _ITEM_URL.format(story_id)
                    score = story.get("score", 0)
                    by = story.get("by", "")
                    descendants = story.get("descendants", 0)

                    if not url:
                        # Self-posts (Ask HN, Show HN)
                        url = hn_url
                        text = story.get("text", "")
                        content = text or f"[Hacker News 讨论帖]({hn_url})"
                    else:
                        # 3. Fetch the linked article
                        content = await self._fetch_article(
                            client, url, title
                        )

                    # Dedup check
                    if is_duplicate(url):
                        logger.debug("Skipping duplicate: %s", url)
                        continue

                    # Build HN metadata line
                    meta_parts = []
                    if by:
                        meta_parts.append(f"作者：{by}")
                    if score:
                        meta_parts.append(f"评分：{score}")
                    if descendants:
                        meta_parts.append(f"评论：{descendants}")
                    meta_line = " | ".join(meta_parts)

                    if meta_line:
                        content = f"{content}\n\n> {meta_line}  \n> [HN 讨论]({hn_url})"

                    articles.append(Article(
                        title=title,
                        content=content,
                        source_url=url,
                        section_id="sec-tech",
                        tags=["tech", "news"],
                    ))
                    logger.debug("Fetched: %s", title)

                    if len(articles) >= max_stories:
                        break

                except Exception as e:
                    logger.warning("Failed story %s: %s", story_id, e)
                    continue

        logger.info("HackerNewsSpider: fetched %d articles", len(articles))
        return articles

    async def _fetch_article(self, client: httpx.AsyncClient, url: str, title: str) -> str:
        """Fetch external article content using Newspaper4k + readability fallback."""
        try:
            page_resp = await client.get(url, timeout=20)
            page_resp.raise_for_status()
            content = await extract_article(url, html=page_resp.text, title_hint=title)
            if content and len(content) >= 80:
                return content
        except httpx.HTTPStatusError as e:
            logger.info("HTTP %s fetching %s", e.response.status_code, url)
        except Exception as e:
            logger.info("Fetch failed for %s: %s", url, e)

        return f"[阅读原文]({url})"
