import unittest

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.database import ColumnMigration, _add_column_if_missing


class DatabaseMigrationTest(unittest.IsolatedAsyncioTestCase):
    async def test_add_column_if_missing_is_idempotent(self) -> None:
        engine = create_async_engine("sqlite+aiosqlite:///:memory:")
        async with engine.begin() as conn:
            await conn.execute(text("CREATE TABLE example (id TEXT PRIMARY KEY)"))

            first = await _add_column_if_missing(
                conn,
                ColumnMigration(
                    table="example",
                    column="metadata_json",
                    definition="metadata_json TEXT DEFAULT '{}'",
                ),
            )
            second = await _add_column_if_missing(
                conn,
                ColumnMigration(
                    table="example",
                    column="metadata_json",
                    definition="metadata_json TEXT DEFAULT '{}'",
                ),
            )

            rows = await conn.execute(text('PRAGMA table_info("example")'))
            columns = [row[1] for row in rows]

        await engine.dispose()

        self.assertTrue(first)
        self.assertFalse(second)
        self.assertEqual(columns.count("metadata_json"), 1)


if __name__ == "__main__":
    unittest.main()
