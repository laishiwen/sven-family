from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List


@dataclass
class Article:
    title: str
    content: str  # Markdown
    source_url: str
    section_id: str = "sec-engineering"
    tags: List[str] = field(default_factory=list)


class BaseSpider(ABC):
    name: str = "base"
    schedule: str = "0 */6 * * *"  # every 6 hours
    source_name: str = "Unknown"
    author_id: str = "crawler"

    @abstractmethod
    async def fetch(self) -> List[Article]:
        ...
