"""
Compliance processor for crawled content.
Only sanitizes dangerous elements and appends source attribution.
Outputs the original article content as-is.
"""

import re
from app.spiders.base import Article


def process_article(article: Article) -> Article:
    """Sanitize and add source attribution only. No content modification."""
    content = article.content or ""

    # Remove dangerous HTML remnants only
    content = re.sub(r'<script[^>]*>.*?</script>', '', content, flags=re.DOTALL | re.IGNORECASE)
    content = re.sub(r'<iframe[^>]*>.*?</iframe>', '', content, flags=re.DOTALL | re.IGNORECASE)

    # Remove duplicate existing attribution lines to avoid stacking
    content = re.sub(r'^> \[?原文\]?\(.*\)\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^> 原文：.*\n?', '', content, flags=re.MULTILINE)
    content = re.sub(r'^---\s*\n?$', '', content, flags=re.MULTILINE)

    # Source attribution
    source_line = f"\n\n---\n> 来源：[{article.source_url}]({article.source_url})"

    return Article(
        title=article.title,
        content=content.strip() + source_line,
        source_url=article.source_url,
        section_id=article.section_id,
        tags=article.tags,
    )
