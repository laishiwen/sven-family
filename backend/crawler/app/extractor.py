"""
Article content extractor using Newspaper4k with readability-lxml fallback.

Newspaper4k handles the majority of news/article sites with high accuracy.
readability-lxml is a fast fallback for sites where Newspaper4k struggles.
"""

import asyncio
import logging
import re
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger("crawler.extractor")

# Single-thread executor for sync libraries
_executor = ThreadPoolExecutor(max_workers=4)

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


async def extract_article(url: str, html: str = "", title_hint: str = "") -> str:
    """Extract article text from a URL using Newspaper4k, with readability fallback.

    Args:
        url: The article URL.
        html: Pre-fetched HTML (optional). If empty, Newspaper4k will download.
        title_hint: Known title to strip from content start to avoid duplication.

    Returns:
        Extracted article text as plain text / simple Markdown.
    """
    content = await _extract_with_newspaper(url, html)
    if not content or len(content) < 80:
        logger.info("Newspaper4k returned short content (%d chars), trying readability", len(content) if content else 0)
        content = await _extract_with_readability(html) if html else ""
        if not content or len(content) < 80:
            # Last resort: try Newspaper4k again with download
            if not html:
                content = await _extract_with_newspaper(url, "")
    if not content:
        return ""

    # Strip duplicated title from content start
    if title_hint:
        content = _strip_leading_title(content, title_hint)

    return _clean_whitespace(content)


async def _extract_with_newspaper(url: str, html: str = "") -> str:
    """Extract using Newspaper4k (runs in thread pool)."""
    try:
        from newspaper import Article

        article = Article(url)
        if html:
            article.download(input_html=html)
        else:
            article.download()

        await asyncio.get_event_loop().run_in_executor(_executor, article.parse)

        text = article.text or ""
        if text:
            logger.debug("Newspaper4k extracted %d chars from %s", len(text), url[:60])
        return text
    except Exception as e:
        logger.debug("Newspaper4k failed for %s: %s", url[:60], e)
        return ""


async def _extract_with_readability(html: str) -> str:
    """Extract using readability-lxml (runs in thread pool)."""
    try:
        from readability import Document

        doc = await asyncio.get_event_loop().run_in_executor(
            _executor, Document, html
        )
        summary_html = doc.summary()
        # Convert to text
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(summary_html, "html.parser")
        text = soup.get_text("\n", strip=True)
        if text:
            logger.debug("readability extracted %d chars", len(text))
        return text
    except Exception as e:
        logger.debug("readability failed: %s", e)
        return ""


def _strip_leading_title(text: str, title: str) -> str:
    """If text starts with the title, remove it."""
    t = text.lstrip()
    normalized_title = re.sub(r"\s+", " ", title).strip()
    # Check first 200 chars for title match
    prefix = t[:max(len(normalized_title) + 20, 200)]
    if normalized_title and normalized_title.lower() in prefix.lower():
        idx = t.lower().find(normalized_title.lower())
        if idx >= 0 and idx < 200:
            t = t[idx + len(normalized_title):]
            t = t.lstrip(":\n\r ")
    return t


def _clean_whitespace(text: str) -> str:
    """Normalize whitespace without removing meaningful line breaks."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def extract_sync(url: str, html: str = "", title_hint: str = "") -> str:
    """Synchronous wrapper for extract_article (for use in sync contexts)."""
    return asyncio.run(extract_article(url, html, title_hint))
