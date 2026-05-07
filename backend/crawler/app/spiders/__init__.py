from app.spiders.hackernews import HackerNewsSpider
from app.spiders.hackernews_ai import HackerNewsAISpider
from app.spiders.github_trending import GitHubTrendingSpider
from app.spiders.devto import DevToSpider

SPIDERS = [
    HackerNewsSpider(),
    HackerNewsAISpider(),
    GitHubTrendingSpider(),
    DevToSpider(),
]
