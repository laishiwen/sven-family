import re
from bs4 import BeautifulSoup
from markdownify import markdownify as md

_STRIP_SELECTORS = [
    "script", "style", "noscript", "iframe", "svg", "canvas",
    "nav", "footer", "header",
    '[class*="sidebar"]', '[class*="ad"]', '[class*="advertisement"]',
    '[class*="social"]', '[class*="share"]', '[class*="related"]',
    '[class*="comment"]', '[class*="footer"]', '[class*="nav"]',
    '[id*="sidebar"]', '[id*="ad"]', '[id*="footer"]', '[id*="nav"]',
    '[class*="cookie"]', '[id*="cookie"]',
    '[class*="popup"]', '[id*="popup"]',
    '[class*="modal"]', '[id*="modal"]',
    '[class*="menu"]', '[id*="menu"]',
    '[class*="subscription"]', '[class*="newsletter"]',
    '[class*="byline"]', '[class*="author"]', '[class*="meta-info"]',
    '[class*="timestamp"]', '[class*="published"]',
    '[class*="breadcrumb"]',
    'form', 'button', 'input', 'select', 'textarea',
]


def clean_html(html: str) -> str:
    """Strip unwanted elements from HTML and convert to Markdown."""
    if not html:
        return ""

    soup = BeautifulSoup(html, "html.parser")

    # Remove elements matching strip selectors
    for selector in _STRIP_SELECTORS:
        for el in soup.select(selector):
            el.decompose()

    # Remove empty elements that only contain whitespace / line breaks
    for el in soup.find_all(lambda tag: tag.name in ("p", "div", "span")
                            and not tag.get_text(strip=True)):
        el.decompose()

    # Convert to Markdown (keep links for attribution context)
    markdown_text = md(
        str(soup),
        heading_style="ATX",
        strip=["img"],
        bullets="-",
    )

    # Clean up leftover garbage lines
    markdown_text = re.sub(r"\n{3,}", "\n\n", markdown_text)
    # Remove lines that are just single chars or URL fragments
    markdown_text = re.sub(r"^\S\n", "", markdown_text, flags=re.MULTILINE)
    # Remove common navigation/category crumbs (single-word lines in succession)
    markdown_text = re.sub(r"(?:^[A-Za-z·|\s]\s*$\n?)+", "", markdown_text, flags=re.MULTILINE)
    # Collapse multiple blank lines again after cleanup
    markdown_text = re.sub(r"\n{3,}", "\n\n", markdown_text)
    return markdown_text.strip()


def extract_title(html: str) -> str:
    """Extract <title> or <h1> from HTML."""
    if not html:
        return ""
    soup = BeautifulSoup(html, "html.parser")
    h1 = soup.find("h1")
    if h1:
        return h1.get_text(strip=True)
    title_tag = soup.find("title")
    if title_tag:
        return title_tag.get_text(strip=True)
    return ""


def summarize(text: str, max_len: int = 200) -> str:
    """Return first N characters as a short description."""
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= max_len:
        return text
    return text[:max_len].rsplit(" ", 1)[0] + "..."
