from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.models import Run, RunArtifact, RunEvent, RunScore, RunStep


SENSITIVE_KEYS = {
    "api_key",
    "apikey",
    "authorization",
    "bearer",
    "cookie",
    "password",
    "secret",
    "token",
}

DEFAULT_CONFIG = {
    "enabled": True,
    "save_full_inputs": True,
    "save_full_outputs": True,
    "save_rag_chunks": True,
    "retention_days": 30,
    "max_preview_chars": 4000,
    "redact_sensitive": True,
}


@dataclass
class StepTimer:
    started_at: float
    step: RunStep


def safe_json_loads(value: str | None, fallback: Any = None) -> Any:
    if not value:
        return fallback
    try:
        return json.loads(value)
    except Exception:
        return fallback if fallback is not None else value


def safe_json_dumps(value: Any) -> str:
    return json.dumps(redact_sensitive(value), ensure_ascii=False, default=str)


def redact_sensitive(value: Any) -> Any:
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            lower = str(key).lower()
            if any(pattern in lower for pattern in SENSITIVE_KEYS):
                redacted[key] = "[REDACTED]"
            else:
                redacted[key] = redact_sensitive(item)
        return redacted
    if isinstance(value, list):
        return [redact_sensitive(item) for item in value]
    if isinstance(value, str):
        value = re.sub(
            r"(?i)(bearer\s+)[a-z0-9._\-]+",
            r"\1[REDACTED]",
            value,
        )
        value = re.sub(
            r"(?i)(api[_-]?key[\"'\s:=]+)[^\"'\s,}]+",
            r"\1[REDACTED]",
            value,
        )
    return value


def preview_text(value: Any, max_chars: int = 4000) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = safe_json_dumps(value)
    if len(value) <= max_chars:
        return value
    return value[:max_chars] + "\n...[truncated]"


def estimate_tokens(text: str) -> int:
    if not text:
        return 0
    # Cheap local estimate that works without tokenizer dependencies.
    return max(1, round(len(text) / 4))


def run_latency_ms(run: Run) -> int:
    end = run.completed_at or datetime.utcnow()
    return max(0, int((end - run.created_at).total_seconds() * 1000))


async def start_step(
    session: AsyncSession,
    run_id: str,
    step_type: str,
    name: str,
    step_index: int = 0,
    input_data: Any = None,
    parent_step_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> StepTimer:
    step = RunStep(
        run_id=run_id,
        parent_step_id=parent_step_id,
        step_index=step_index,
        step_type=step_type,
        name=name,
        input_json=safe_json_dumps(input_data) if input_data is not None else None,
        metadata_json=safe_json_dumps(metadata or {}),
        status="running",
    )
    session.add(step)
    await session.commit()
    await session.refresh(step)
    return StepTimer(started_at=time.perf_counter(), step=step)


async def finish_step(
    session: AsyncSession,
    timer: StepTimer,
    output_data: Any = None,
    metadata: dict[str, Any] | None = None,
) -> RunStep:
    step = timer.step
    step.status = "completed"
    step.latency_ms = max(0, int((time.perf_counter() - timer.started_at) * 1000))
    if output_data is not None:
        step.output_json = safe_json_dumps(output_data)
    if metadata:
        existing = safe_json_loads(step.metadata_json, {}) or {}
        if isinstance(existing, dict):
            existing.update(metadata)
            step.metadata_json = safe_json_dumps(existing)
    session.add(step)
    await session.commit()
    await session.refresh(step)
    return step


async def fail_step(
    session: AsyncSession,
    timer: StepTimer,
    error: Exception | str,
    metadata: dict[str, Any] | None = None,
) -> RunStep:
    step = timer.step
    step.status = "failed"
    step.latency_ms = max(0, int((time.perf_counter() - timer.started_at) * 1000))
    existing = safe_json_loads(step.metadata_json, {}) or {}
    if not isinstance(existing, dict):
        existing = {}
    existing.update(metadata or {})
    existing["error"] = str(error)
    step.metadata_json = safe_json_dumps(existing)
    session.add(step)
    await session.commit()
    await session.refresh(step)
    return step


async def record_step(
    session: AsyncSession,
    run_id: str,
    step_type: str,
    name: str,
    step_index: int = 0,
    input_data: Any = None,
    output_data: Any = None,
    metadata: dict[str, Any] | None = None,
    status: str = "completed",
    latency_ms: int = 0,
    parent_step_id: str | None = None,
) -> RunStep:
    step = RunStep(
        run_id=run_id,
        parent_step_id=parent_step_id,
        step_index=step_index,
        step_type=step_type,
        name=name,
        input_json=safe_json_dumps(input_data) if input_data is not None else None,
        output_json=safe_json_dumps(output_data) if output_data is not None else None,
        metadata_json=safe_json_dumps(metadata or {}),
        status=status,
        latency_ms=latency_ms,
    )
    session.add(step)
    await session.commit()
    await session.refresh(step)
    return step


async def record_artifact(
    session: AsyncSession,
    run_id: str,
    artifact_type: str,
    name: str,
    content: Any,
    step_id: str | None = None,
    content_type: str = "text/plain",
    metadata: dict[str, Any] | None = None,
) -> RunArtifact:
    artifact = RunArtifact(
        run_id=run_id,
        step_id=step_id,
        artifact_type=artifact_type,
        name=name,
        content=preview_text(redact_sensitive(content), 20000),
        content_type=content_type,
        metadata_json=safe_json_dumps(metadata or {}),
    )
    session.add(artifact)
    await session.commit()
    await session.refresh(artifact)
    return artifact


async def record_event(
    session: AsyncSession,
    run_id: str,
    event_type: str,
    content: Any,
    step_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> RunEvent:
    event = RunEvent(
        run_id=run_id,
        step_id=step_id,
        event_type=event_type,
        content=preview_text(content, 4000),
        metadata_json=safe_json_dumps(metadata or {}),
    )
    session.add(event)
    await session.commit()
    await session.refresh(event)
    return event


async def record_score(
    session: AsyncSession,
    run_id: str,
    name: str,
    value: Any,
    score_type: str = "numeric",
    source: str = "system",
    comment: str | None = None,
    step_id: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> RunScore:
    score = RunScore(
        run_id=run_id,
        step_id=step_id,
        name=name,
        score_type=score_type,
        value=str(value),
        comment=comment,
        source=source,
        metadata_json=safe_json_dumps(metadata or {}),
    )
    session.add(score)
    await session.commit()
    await session.refresh(score)
    return score


async def finalize_run_success(
    session: AsyncSession,
    run: Run,
    output_text: str = "",
    input_text: str = "",
) -> Run:
    run.status = "completed"
    run.completed_at = datetime.utcnow()
    run.latency_ms = run_latency_ms(run)
    if input_text and not run.input_tokens:
        run.input_tokens = estimate_tokens(input_text)
    if output_text and not run.output_tokens:
        run.output_tokens = estimate_tokens(output_text)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def finalize_run_failure(session: AsyncSession, run: Run, error: Exception | str) -> Run:
    run.status = "failed"
    run.error_msg = str(error)
    run.completed_at = datetime.utcnow()
    run.latency_ms = run_latency_ms(run)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def export_run(session: AsyncSession, run_id: str) -> dict[str, Any] | None:
    run = await session.get(Run, run_id)
    if not run:
        return None

    steps = (
        await session.exec(
            select(RunStep).where(RunStep.run_id == run_id).order_by(RunStep.created_at.asc())
        )
    ).all()
    scores = (
        await session.exec(
            select(RunScore).where(RunScore.run_id == run_id).order_by(RunScore.created_at.asc())
        )
    ).all()
    artifacts = (
        await session.exec(
            select(RunArtifact).where(RunArtifact.run_id == run_id).order_by(RunArtifact.created_at.asc())
        )
    ).all()
    events = (
        await session.exec(
            select(RunEvent).where(RunEvent.run_id == run_id).order_by(RunEvent.created_at.asc())
        )
    ).all()

    return {
        "run": run.model_dump(),
        "steps": [item.model_dump() for item in steps],
        "scores": [item.model_dump() for item in scores],
        "artifacts": [item.model_dump() for item in artifacts],
        "events": [item.model_dump() for item in events],
    }


async def cleanup_observability(
    session: AsyncSession,
    retention_days: int = 30,
    status: str | None = None,
) -> int:
    cutoff = datetime.utcnow() - timedelta(days=max(1, retention_days))
    query = select(Run).where(Run.created_at < cutoff)
    if status:
        query = query.where(Run.status == status)
    runs = (await session.exec(query)).all()
    run_ids = [run.id for run in runs]
    if not run_ids:
        return 0

    for model in (RunEvent, RunArtifact, RunScore, RunStep):
        rows = (await session.exec(select(model).where(model.run_id.in_(run_ids)))).all()
        for row in rows:
            await session.delete(row)
    for run in runs:
        await session.delete(run)
    await session.commit()
    return len(run_ids)
