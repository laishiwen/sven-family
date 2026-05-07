import logging
import httpx
from bs4 import BeautifulSoup
from app.config import settings
from app.spiders.base import BaseSpider, Article
from app.dedup import is_duplicate

logger = logging.getLogger("crawler.spiders.github_trending")

_GITHUB_TRENDING_URL = "https://github.com/trending"
_LANGUAGES = [
    "python", "javascript", "typescript", "go", "rust",
    "java", "kotlin", "swift", "cpp", "ruby",
]


class GitHubTrendingSpider(BaseSpider):
    name = "github_trending"
    schedule = settings.spider_github_trending_schedule
    source_name = "GitHub Trending"

    async def fetch(self):
        articles = []
        headers = {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        }
        async with httpx.AsyncClient(timeout=30, headers=headers) as client:
            for lang in _LANGUAGES:
                if len(articles) >= settings.spider_max_articles_per_run:
                    break
                try:
                    url = f"{_GITHUB_TRENDING_URL}/{lang}?since=weekly"
                    logger.debug("Fetching GitHub trending: %s", url)
                    resp = await client.get(url, follow_redirects=True)
                    resp.raise_for_status()

                    soup = BeautifulSoup(resp.text, "html.parser")
                    repo_articles = await self._parse_trending_page(
                        soup, lang, client
                    )
                    articles.extend(repo_articles)
                    logger.debug("Found %d repos for %s", len(repo_articles), lang)
                except Exception as e:
                    logger.warning(
                        "Failed to fetch trending for %s: %s", lang, e
                    )
                    continue

        logger.info(
            "GitHubTrendingSpider: fetched %d articles", len(articles)
        )
        return articles[:settings.spider_max_articles_per_run]

    async def _parse_trending_page(self, soup, language, client):
        """Parse a GitHub trending page and return Article objects."""
        articles = []
        repo_articles = soup.select("article.Box-row")

        for repo_el in repo_articles:
            try:
                h1 = repo_el.select_one("h2 a")
                if not h1:
                    continue
                href = h1.get("href", "").strip("/")
                repo_url = f"https://github.com/{href}"

                if is_duplicate(repo_url):
                    continue

                desc_el = repo_el.select_one("p")
                description = desc_el.get_text(strip=True) if desc_el else ""

                stars_el = repo_el.select_one("a[href*='/stargazers']")
                stars = stars_el.get_text(strip=True) if stars_el else "0"

                lang_el = repo_el.select_one(
                    "span[itemprop='programmingLanguage']"
                )
                repo_lang = lang_el.get_text(strip=True) if lang_el else language

                content = await self._fetch_readme(repo_url, client)

                if not content:
                    content = (
                        f"**Repository:** {repo_url}\n\n"
                        f"**Language:** {repo_lang}\n"
                        f"**Stars:** {stars}\n\n"
                        f"**Description:** {description}"
                    )

                article = Article(
                    title=href,
                    content=content,
                    source_url=repo_url,
                    section_id="sec-engineering",
                    tags=["github", "open-source", "dev", language],
                )
                articles.append(article)

            except Exception as e:
                logger.debug("Failed to parse repo entry: %s", e)
                continue

        return articles

    async def _fetch_readme(self, repo_url: str, client: httpx.AsyncClient) -> str:
        """Try to fetch the README content for a GitHub repo."""
        repo_path = repo_url.replace("https://github.com/", "")
        readme_urls = [
            f"https://raw.githubusercontent.com/{repo_path}/main/README.md",
            f"https://raw.githubusercontent.com/{repo_path}/master/README.md",
        ]

        for readme_url in readme_urls:
            try:
                resp = await client.get(readme_url, timeout=10)
                resp.raise_for_status()
                text = resp.text

                if len(text) > 5000:
                    text = text[:5000].rsplit("\n", 1)[0] + "\n\n*... (truncated)*"

                return text
            except Exception:
                continue

        return ""
