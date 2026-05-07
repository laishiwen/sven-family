import unittest
from datetime import datetime, timedelta

from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import StaticPool
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.orm import sessionmaker

from app.models import Run
from app.services.observability import (
    cleanup_observability,
    export_run,
    finalize_run_success,
    record_artifact,
    record_score,
    record_step,
    redact_sensitive,
)


class ObservabilityServiceTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.engine = create_async_engine(
            "sqlite+aiosqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        async with self.engine.begin() as conn:
            await conn.run_sync(SQLModel.metadata.create_all)
        self.session_factory = sessionmaker(
            self.engine,
            class_=AsyncSession,
            expire_on_commit=False,
        )

    async def asyncTearDown(self) -> None:
        await self.engine.dispose()

    async def test_records_exports_and_cleans_local_observability_data(self) -> None:
        async with self.session_factory() as session:
            run = Run(
                id="run-1",
                session_id="session-1",
                trace_provider="local",
                status="running",
                created_at=datetime.utcnow() - timedelta(days=40),
            )
            session.add(run)
            await session.commit()

            step = await record_step(
                session,
                run.id,
                step_type="tool_call",
                name="test_tool",
                input_data={"api_key": "secret", "message": "hello"},
                output_data={"ok": True},
            )
            await record_artifact(
                session,
                run.id,
                artifact_type="completion",
                name="answer",
                content="hello world",
                step_id=step.id,
            )
            await record_score(
                session,
                run.id,
                name="run_success",
                value=True,
                score_type="boolean",
            )
            await finalize_run_success(
                session,
                run,
                input_text="hello",
                output_text="hello world",
            )

            payload = await export_run(session, run.id)
            self.assertIsNotNone(payload)
            self.assertEqual(payload["run"]["id"], run.id)
            self.assertEqual(payload["steps"][0]["name"], "test_tool")
            self.assertIn("[REDACTED]", payload["steps"][0]["input_json"])
            self.assertEqual(payload["scores"][0]["name"], "run_success")
            self.assertEqual(payload["artifacts"][0]["name"], "answer")

            deleted = await cleanup_observability(session, retention_days=30)
            self.assertEqual(deleted, 1)
            self.assertIsNone(await export_run(session, run.id))

    def test_redact_sensitive_values(self) -> None:
        redacted = redact_sensitive(
            {
                "Authorization": "Bearer abc123",
                "nested": {"api_key": "secret"},
                "safe": "value",
            }
        )

        self.assertEqual(redacted["Authorization"], "[REDACTED]")
        self.assertEqual(redacted["nested"]["api_key"], "[REDACTED]")
        self.assertEqual(redacted["safe"], "value")


if __name__ == "__main__":
    unittest.main()
