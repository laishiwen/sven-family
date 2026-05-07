from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select, func
from app.core.database import get_session
from app.models import Run, RunArtifact, RunEvent, RunScore, RunStep, RuntimeConfig
from app.schemas import RunResponse
from app.services.observability import (
    DEFAULT_CONFIG,
    cleanup_observability,
    estimate_tokens,
    export_run,
    record_score,
    safe_json_loads,
)
from datetime import datetime
import json

router = APIRouter(prefix="/observability", tags=["Observability"])


def _safe_json_loads(value: str | None):
    return safe_json_loads(value)


def _normalize_status(value: str | None) -> str:
    if value == "completed":
        return "success"
    return value or "unknown"


def _artifact_token_counts(artifacts: list[RunArtifact]) -> tuple[int, int]:
    input_tokens = 0
    output_tokens = 0
    for artifact in artifacts:
        artifact_type = (artifact.artifact_type or "").lower()
        name = (artifact.name or "").lower()
        token_count = estimate_tokens(artifact.content or "")
        if artifact_type in {"prompt", "rag_context"} or "prompt" in name:
            input_tokens += token_count
        elif artifact_type in {"completion", "tool_output"} or "response" in name:
            output_tokens += token_count
    return input_tokens, output_tokens


def _hydrated_run_payload(
    run: Run,
    score_count: int = 0,
    artifact_count: int = 0,
    event_count: int = 0,
    artifacts: list[RunArtifact] | None = None,
) -> dict:
    fallback_input_tokens, fallback_output_tokens = _artifact_token_counts(artifacts or [])
    input_tokens = run.input_tokens or fallback_input_tokens
    output_tokens = run.output_tokens or fallback_output_tokens
    latency_ms = run.latency_ms or (
        max(0, int(((run.completed_at or datetime.utcnow()) - run.created_at).total_seconds() * 1000))
        if run.created_at
        else 0
    )
    data = run.model_dump()
    data.update(
        {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "latency_ms": latency_ms,
            "error_msg": run.error_msg,
            "score_count": score_count,
            "artifact_count": artifact_count,
            "event_count": event_count,
        }
    )
    return data


@router.get("/runs", response_model=list[RunResponse])
async def list_runs(
    limit: int = 50,
    status: str = None,
    session: AsyncSession = Depends(get_session),
):
    query = select(Run).order_by(Run.created_at.desc()).limit(limit)
    if status:
        query = query.where(Run.status == status)
    result = await session.exec(query)
    runs = result.all()
    payloads = []
    for run in runs:
        scores = (await session.exec(select(func.count(RunScore.id)).where(RunScore.run_id == run.id))).one()
        artifacts = (
            await session.exec(select(RunArtifact).where(RunArtifact.run_id == run.id))
        ).all()
        events = (await session.exec(select(func.count(RunEvent.id)).where(RunEvent.run_id == run.id))).one()
        payloads.append(
            _hydrated_run_payload(
                run,
                score_count=scores,
                artifact_count=len(artifacts),
                event_count=events,
                artifacts=artifacts,
            )
        )
    return payloads


@router.get("/runs/{run_id}")
async def get_run_detail(run_id: str, session: AsyncSession = Depends(get_session)):
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    steps_result = await session.exec(
        select(RunStep).where(RunStep.run_id == run_id).order_by(RunStep.created_at.asc())
    )
    steps = steps_result.all()
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

    serialized_steps = []
    for step in steps:
        metadata = _safe_json_loads(step.metadata_json) or {}
        serialized_steps.append(
            {
                "id": step.id,
                "run_id": step.run_id,
                "parent_step_id": step.parent_step_id,
                "step_index": step.step_index,
                "step_type": step.step_type,
                "name": step.name,
                "input": _safe_json_loads(step.input_json),
                "output": _safe_json_loads(step.output_json),
                "metadata": metadata,
                "status": _normalize_status(step.status),
                "latency_ms": step.latency_ms,
                "created_at": step.created_at.isoformat(),
                "error": metadata.get("error") if isinstance(metadata, dict) else None,
            }
        )

    score_count = len(scores)
    artifact_count = len(artifacts)
    event_count = len(events)
    hydrated_run = _hydrated_run_payload(
        run,
        score_count=score_count,
        artifact_count=artifact_count,
        event_count=event_count,
        artifacts=artifacts,
    )

    return {
        "run": hydrated_run,
        "steps": serialized_steps,
        "timeline": [
            {
                "id": s["id"],
                "type": s["step_type"],
                "name": s["name"],
                "status": s["status"],
                "latency_ms": s["latency_ms"],
                "created_at": s["created_at"],
            }
            for s in serialized_steps
        ],
        "scores": [
            {
                "id": score.id,
                "run_id": score.run_id,
                "step_id": score.step_id,
                "name": score.name,
                "score_type": score.score_type,
                "value": score.value,
                "comment": score.comment,
                "source": score.source,
                "metadata": _safe_json_loads(score.metadata_json) or {},
                "created_at": score.created_at.isoformat(),
            }
            for score in scores
        ],
        "artifacts": [
            {
                "id": artifact.id,
                "run_id": artifact.run_id,
                "step_id": artifact.step_id,
                "artifact_type": artifact.artifact_type,
                "name": artifact.name,
                "content": artifact.content,
                "content_type": artifact.content_type,
                "metadata": _safe_json_loads(artifact.metadata_json) or {},
                "created_at": artifact.created_at.isoformat(),
            }
            for artifact in artifacts
        ],
        "events": [
            {
                "id": event.id,
                "run_id": event.run_id,
                "step_id": event.step_id,
                "event_type": event.event_type,
                "content": event.content,
                "metadata": _safe_json_loads(event.metadata_json) or {},
                "created_at": event.created_at.isoformat(),
            }
            for event in events
        ],
        "summary": {
            "status": _normalize_status(run.status),
            "trace_id": run.trace_id,
            "trace_provider": run.trace_provider,
            "input_tokens": hydrated_run["input_tokens"],
            "output_tokens": hydrated_run["output_tokens"],
            "total_tokens": hydrated_run["input_tokens"] + hydrated_run["output_tokens"],
            "total_cost": run.total_cost,
            "latency_ms": hydrated_run["latency_ms"],
            "error_msg": run.error_msg,
            "metadata": _safe_json_loads(run.metadata_json),
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "score_count": score_count,
            "artifact_count": artifact_count,
            "event_count": event_count,
        },
    }


@router.get("/traces")
async def list_traces(
    limit: int = 50,
    session: AsyncSession = Depends(get_session),
):
    result = await session.exec(
        select(Run).where(Run.trace_id.isnot(None)).order_by(Run.created_at.desc()).limit(limit)
    )
    runs = result.all()
    return [
        {
            "run_id": r.id,
            "trace_id": r.trace_id,
            "status": r.status,
            "input_tokens": r.input_tokens,
            "output_tokens": r.output_tokens,
            "total_cost": r.total_cost,
            "latency_ms": r.latency_ms,
            "created_at": r.created_at.isoformat(),
        }
        for r in runs
    ]


@router.get("/stats/usage")
async def get_usage_stats(session: AsyncSession = Depends(get_session)):
    """Get aggregated usage statistics"""
    runs_result = await session.exec(select(Run).order_by(Run.created_at.asc()))
    runs = runs_result.all()
    score_count = (await session.exec(select(func.count(RunScore.id)))).one()
    artifact_count = (await session.exec(select(func.count(RunArtifact.id)))).one()
    event_count = (await session.exec(select(func.count(RunEvent.id)))).one()

    total_runs = len(runs)
    failed_runs = sum(1 for run in runs if _normalize_status(run.status) == "failed")
    completed_runs = sum(
        1 for run in runs if _normalize_status(run.status) in {"success", "completed"}
    )
    artifact_rows = (await session.exec(select(RunArtifact))).all()
    artifacts_by_run: dict[str, list[RunArtifact]] = {}
    for artifact in artifact_rows:
        artifacts_by_run.setdefault(artifact.run_id, []).append(artifact)

    hydrated_runs = [
        _hydrated_run_payload(run, artifacts=artifacts_by_run.get(run.id, []))
        for run in runs
    ]
    total_tokens = sum(
        (run["input_tokens"] or 0) + (run["output_tokens"] or 0)
        for run in hydrated_runs
    )
    total_cost = sum(run.total_cost or 0.0 for run in runs)
    avg_latency_ms = (
        round(sum(run["latency_ms"] or 0 for run in hydrated_runs) / total_runs, 2)
        if total_runs
        else 0
    )

    daily_usage_map: dict[str, dict] = {}
    for run in runs:
        date_key = run.created_at.date().isoformat() if run.created_at else datetime.utcnow().date().isoformat()
        bucket = daily_usage_map.setdefault(
            date_key,
            {
                "date": date_key,
                "request_count": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "total_tokens": 0,
                "total_cost": 0.0,
                "error_count": 0,
            },
        )
        bucket["request_count"] += 1
        hydrated = _hydrated_run_payload(run, artifacts=artifacts_by_run.get(run.id, []))
        bucket["input_tokens"] += hydrated["input_tokens"] or 0
        bucket["output_tokens"] += hydrated["output_tokens"] or 0
        bucket["total_tokens"] += (hydrated["input_tokens"] or 0) + (hydrated["output_tokens"] or 0)
        bucket["total_cost"] += run.total_cost or 0.0
        if _normalize_status(run.status) == "failed":
            bucket["error_count"] += 1

    daily_usage = list(daily_usage_map.values())[-14:]

    return {
        "total_runs": total_runs,
        "total_requests": total_runs,
        "total_tokens": total_tokens,
        "total_cost": round(total_cost, 6),
        "avg_latency_ms": avg_latency_ms,
        "completed_runs": completed_runs,
        "failed_runs": failed_runs,
        "success_rate": round((completed_runs / total_runs) * 100, 2) if total_runs else 0,
        "score_count": score_count,
        "artifact_count": artifact_count,
        "event_count": event_count,
        "daily_usage": daily_usage,
    }


@router.post("/runs/{run_id}/feedback")
async def add_run_feedback(
    run_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")

    value = body.get("value")
    if value is None:
        raise HTTPException(422, "Feedback value is required")

    score = await record_score(
        session=session,
        run_id=run_id,
        name=str(body.get("name") or "user_feedback"),
        value=value,
        score_type=str(body.get("score_type") or "categorical"),
        source="user",
        comment=body.get("comment"),
        metadata=body.get("metadata") if isinstance(body.get("metadata"), dict) else {},
    )
    return {
        "id": score.id,
        "run_id": score.run_id,
        "name": score.name,
        "value": score.value,
        "source": score.source,
    }


@router.get("/runs/{run_id}/export")
async def export_run_detail(run_id: str, session: AsyncSession = Depends(get_session)):
    payload = await export_run(session, run_id)
    if not payload:
        raise HTTPException(404, "Run not found")
    return JSONResponse(
        content=json.loads(json.dumps(payload, default=str, ensure_ascii=False)),
        headers={"Content-Disposition": f'attachment; filename="run-{run_id}.json"'},
    )


@router.delete("/runs/{run_id}", status_code=204)
async def delete_run(run_id: str, session: AsyncSession = Depends(get_session)):
    run = await session.get(Run, run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    for model in (RunEvent, RunArtifact, RunScore, RunStep):
        rows = (await session.exec(select(model).where(model.run_id == run_id))).all()
        for row in rows:
            await session.delete(row)
    await session.delete(run)
    await session.commit()


@router.post("/cleanup")
async def cleanup_runs(body: dict | None = None, session: AsyncSession = Depends(get_session)):
    body = body or {}
    retention_days = int(body.get("retention_days") or DEFAULT_CONFIG["retention_days"])
    deleted = await cleanup_observability(
        session,
        retention_days=retention_days,
        status=body.get("status"),
    )
    return {"deleted": deleted, "retention_days": retention_days}


@router.get("/config")
async def get_observability_config(session: AsyncSession = Depends(get_session)):
    config = dict(DEFAULT_CONFIG)
    result = await session.exec(
        select(RuntimeConfig).where(RuntimeConfig.group == "observability.local")
    )
    for item in result.all():
        loaded = _safe_json_loads(item.description)
        if loaded is not None:
            config[item.key] = loaded
    return config


@router.put("/config")
async def update_observability_config(
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    allowed = set(DEFAULT_CONFIG)
    for key, value in body.items():
        if key not in allowed:
            continue
        result = await session.exec(
            select(RuntimeConfig).where(
                RuntimeConfig.key == key,
                RuntimeConfig.group == "observability.local",
            )
        )
        item = result.first()
        if not item:
            item = RuntimeConfig(
                key=key,
                source="local",
                group="observability.local",
                is_sensitive=False,
            )
        item.description = json.dumps(value, ensure_ascii=False)
        session.add(item)
    await session.commit()
    return await get_observability_config(session)
