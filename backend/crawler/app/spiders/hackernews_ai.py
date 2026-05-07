from app.spiders.hackernews import HackerNewsSpider, _API_BASE, _ITEM_URL, _HEADERS, logger
from app.spiders.base import Article
from app.dedup import is_duplicate
from app.config import settings
import httpx

AI_KEYWORDS = {
    "ai", "llm", "gpt", "openai", "anthropic", "deepmind",
    "machine learning", "artificial intelligence", "model",
}


class HackerNewsAISpider(HackerNewsSpider):
    name = "hackernews_ai"
    schedule = settings.spider_hackernews_schedule
    source_name = "Hacker News AI"
    author_id = "crawler-ai_news"

    async def fetch(self):
        articles = []
        max_stories = settings.spider_max_articles_per_run
        limits = httpx.Limits(max_keepalive_connections=5, max_connections=10)
        async with httpx.AsyncClient(
            timeout=30, headers=_HEADERS, follow_redirects=True, limits=limits,
        ) as client:
            logger.info("Fetching top story IDs for AI filtering")
            resp = await client.get(f"{_API_BASE}/topstories.json")
            resp.raise_for_status()
            story_ids = resp.json()[:80]

            for story_id in story_ids:
                if len(articles) >= max_stories:
                    break
                try:
                    item_resp = await client.get(
                        f"{_API_BASE}/item/{story_id}.json"
                    )
                    item_resp.raise_for_status()
                    story = item_resp.json()
                    if not story:
                        continue

                    title = story.get("title", "")
                    if not self._is_ai_topic(title):
                        continue

                    url = story.get("url", "")
                    hn_url = _ITEM_URL.format(story_id)
                    score = story.get("score", 0)
                    by = story.get("by", "")
                    descendants = story.get("descendants", 0)

                    if not url:
                        url = hn_url
                        text = story.get("text", "")
                        content = text or f"[Hacker News 讨论帖]({hn_url})"
                    else:
                        content = await self._fetch_article(client, url, title)

                    if is_duplicate(url):
                        logger.debug("Skipping duplicate: %s", url)
                        continue

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
                        tags=["ai", "news", "hackernews"],
                    ))
                    logger.debug("AI Fetched: %s", title)

                except Exception as e:
                    logger.warning("Failed AI story %s: %s", story_id, e)
                    continue

        logger.info("HackerNewsAISpider: fetched %d articles", len(articles))
        return articles

    @staticmethod
    def _is_ai_topic(title: str) -> bool:
        lower_title = (title or "").lower()
        return any(keyword in lower_title for keyword in AI_KEYWORDS)
