import logging
import httpx
from app.config import settings
from app.spiders.base import BaseSpider, Article
from app.extractor import extract_article
from app.dedup import is_duplicate

logger = logging.getLogger("crawler.spiders.devto")

_DEVTO_API = "https://dev.to/api/articles"


class DevToSpider(BaseSpider):
    name = "devto"
    schedule = settings.spider_devto_schedule
    source_name = "DEV Community"

    async def fetch(self):
        articles = []
        async with httpx.AsyncClient(timeout=30) as client:
            # Fetch top/popular articles
            # top=1 returns top articles of the past week
            params = {
                "top": 1,
                "per_page": settings.spider_max_articles_per_run,
            }
            logger.info(
                "Fetching top articles from DEV.to API (top=1, per_page=%d)",
                settings.spider_max_articles_per_run,
            )
            resp = await client.get(_DEVTO_API, params=params)
            resp.raise_for_status()
            items = resp.json()

            if not isinstance(items, list):
                logger.warning("Unexpected DEV.to API response format")
                return articles

            for item in items:
                try:
                    title = item.get("title", "")
                    url = item.get("url", "")
                    description = item.get("description", "")
                    tags_str = item.get("tags", "")
                    cover_image = item.get("cover_image", "")
                    user = item.get("user", {})
                    username = user.get("username", "unknown") if user else "unknown"

                    if not title or not url:
                        continue

                    if is_duplicate(url):
                        logger.debug("Skipping duplicate: %s", url)
                        continue

                    # Fetch the full article page content
                    content = await self._fetch_article_content(url, client, description)

                    # Parse tags from comma-separated string
                    tags = ["dev", "programming"]
                    if tags_str:
                        extra_tags = [
                            t.strip().lower()
                            for t in tags_str.split(",")
                            if t.strip()
                        ]
                        tags.extend(extra_tags[:3])  # max 3 extra tags

                    article = Article(
                        title=title,
                        content=content,
                        source_url=url,
                        section_id="sec-engineering",
                        tags=tags,
                    )
                    articles.append(article)
                    logger.debug("Fetched: %s", title)

                except Exception as e:
                    logger.warning("Failed to process DEV.to article: %s", e)
                    continue

        logger.info("DevToSpider: fetched %d articles", len(articles))
        return articles

    async def _fetch_article_content(
        self, url: str, client: httpx.AsyncClient, fallback_desc: str
    ) -> str:
        """Fetch full article using DEV.to API with Newspaper4k fallback."""
        try:
            # Primary: DEV.to API returns clean body_markdown
            path = url.replace("https://dev.to/", "")
            api_url = f"{_DEVTO_API}/{path}"
            api_resp = await client.get(api_url, timeout=15)
            if api_resp.status_code == 200:
                data = api_resp.json()
                body_markdown = data.get("body_markdown", "")
                if body_markdown and len(body_markdown) > 100:
                    return body_markdown

            # Secondary: Newspaper4k extraction
            page_resp = await client.get(url, follow_redirects=True, timeout=15)
            page_resp.raise_for_status()
            content = await extract_article(url, html=page_resp.text, title_hint="")
            if content and len(content) > 80:
                return content

        except Exception as e:
            logger.debug("DevTo article fetch failed: %s", e)

        return fallback_desc or f"[阅读原文]({url})"
