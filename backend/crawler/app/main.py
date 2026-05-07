import logging
import sys
from apscheduler.schedulers.background import BackgroundScheduler
from app.config import settings
from app.scheduler import setup_scheduler
from app.spiders import SPIDERS
from app.health import start_health_server

logging.basicConfig(
    level=settings.crawler_log_level,
    stream=sys.stdout,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("crawler")


def main():
    logger.info("Starting crawler with %d spiders", len(SPIDERS))
    start_health_server()
    scheduler = BackgroundScheduler()
    setup_scheduler(scheduler)
    scheduler.start()
    logger.info("Scheduler started. Press Ctrl+C to exit.")
    try:
        import time

        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        scheduler.shutdown()
        logger.info("Crawler stopped.")


if __name__ == "__main__":
    main()
