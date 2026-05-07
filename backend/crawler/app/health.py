"""Lightweight health check HTTP server for the crawler process.

Runs on a separate thread so the scheduler is unaffected.
Endpoint: GET /health -> {"status": "ok"}
"""

import json
import logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from threading import Thread

from app.config import settings

logger = logging.getLogger("crawler.health")


class HealthHandler(BaseHTTPRequestHandler):
    """Health check + spider trigger handler."""

    def do_GET(self) -> None:
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self) -> None:
        if self.path.startswith("/run/"):
            spider_name = self.path[5:]
            max_articles = None
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                if content_length > 0:
                    body = json.loads(self.rfile.read(content_length))
                    if isinstance(body, dict) and "max_articles" in body:
                        max_articles = int(body["max_articles"])
            except (json.JSONDecodeError, ValueError):
                pass
            t = Thread(
                target=self._run_spider_bg, args=(spider_name, max_articles),
                daemon=True, name=f"trigger-{spider_name}"
            )
            t.start()
            self.send_response(202)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "accepted": True,
                "spider": spider_name,
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    @staticmethod
    def _run_spider_bg(spider_name: str, max_articles: int | None = None) -> None:
        from app.scheduler import run_spider_by_name
        run_spider_by_name(spider_name, max_articles=max_articles)

    def log_message(self, fmt: str, *args) -> None:
        """Suppress default HTTP request logging."""
        logger.debug(fmt, *args)


def start_health_server() -> Thread:
    """Start the health check HTTP server in a daemon thread."""
    server = HTTPServer(("0.0.0.0", settings.health_check_port), HealthHandler)
    thread = Thread(target=server.serve_forever, daemon=True, name="health-check")
    thread.start()
    logger.info("Health check server started on port %d", settings.health_check_port)
    return thread
