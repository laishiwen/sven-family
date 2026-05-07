#!/usr/bin/env python3
"""
Initialize stats database
Run this script to create all necessary tables
"""
import asyncio
import sys
from pathlib import Path

# Add app to path
sys.path.insert(0, str(Path(__file__).parent))

from app.core.database import init_db


async def main():
    print("Initializing stats database...")
    try:
        await init_db()
        print("✓ Database initialized successfully!")
    except Exception as e:
        print(f"✗ Error initializing database: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
