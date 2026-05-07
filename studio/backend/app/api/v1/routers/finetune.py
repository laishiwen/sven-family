from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel import select
from app.core.database import get_session
from app.models import Dataset, FineTuneJob, Model
from app.schemas import DatasetCreate, DatasetResponse, FineTuneJobCreate, FineTuneJobResponse
from app.core.config import settings
from datetime import datetime
from pathlib import Path
import uuid
import asyncio
import json
import pandas as pd

dataset_router = APIRouter(prefix="/datasets", tags=["Datasets"])
finetune_router = APIRouter(prefix="/fine-tune", tags=["LoRA Fine-tuning"])


# Datasets
def _load_dataset_frame(dataset: Dataset) -> pd.DataFrame:
    if not dataset.file_path or not Path(dataset.file_path).exists():
        raise HTTPException(404, "Dataset file not found")

    file_path = Path(dataset.file_path)
    suffix = file_path.suffix.lower()
    if suffix == ".jsonl":
        rows = []
        with open(file_path, encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    rows.append(json.loads(line))
        return pd.DataFrame(rows)
    if suffix == ".csv":
        return pd.read_csv(file_path)
    if suffix == ".parquet":
        return pd.read_parquet(file_path)
    if suffix == ".json":
        return pd.read_json(file_path)
    raise HTTPException(400, f"Unsupported dataset format: {suffix}")


def _write_dataset_frame(frame: pd.DataFrame, output_path: Path, format_name: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    if format_name == "jsonl":
        frame.to_json(output_path, orient="records", lines=True, force_ascii=True)
        return
    if format_name == "csv":
        frame.to_csv(output_path, index=False)
        return
    if format_name == "parquet":
        frame.to_parquet(output_path, index=False)
        return
    raise HTTPException(400, f"Unsupported export format: {format_name}")


@dataset_router.get("", response_model=list[DatasetResponse])
async def list_datasets(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(Dataset))
    return result.all()


@dataset_router.post("", response_model=DatasetResponse, status_code=201)
async def create_dataset(body: DatasetCreate, session: AsyncSession = Depends(get_session)):
    dataset = Dataset(**body.model_dump())
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@dataset_router.post("/upload", response_model=DatasetResponse, status_code=201)
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = "",
    field_mapping: str = "{}",
    session: AsyncSession = Depends(get_session),
):
    dataset_name = name or Path(file.filename or "dataset").stem
    suffix = Path(file.filename or "dataset.jsonl").suffix.lower().lstrip(".") or "jsonl"
    dataset = Dataset(
        name=dataset_name,
        format=suffix,
        field_mapping_json=field_mapping or "{}",
    )
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)

    upload_dir = Path(settings.APP_DATA_DIR) / "datasets"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{dataset.id}_{file.filename}"

    content = await file.read()
    with open(file_path, "wb") as handle:
        handle.write(content)

    dataset.file_path = str(file_path)
    try:
        frame = _load_dataset_frame(dataset)
        dataset.row_count = len(frame.index)
        dataset.status = "ready"
    except Exception as exc:
        dataset.status = "error"
        dataset.description = f"Upload parse failed: {exc}"

    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@dataset_router.get("/{dataset_id}", response_model=DatasetResponse)
async def get_dataset(dataset_id: str, session: AsyncSession = Depends(get_session)):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    return dataset


@dataset_router.patch("/{dataset_id}", response_model=DatasetResponse)
async def update_dataset(
    dataset_id: str, body: dict, session: AsyncSession = Depends(get_session)
):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    for k, v in body.items():
        if hasattr(dataset, k):
            setattr(dataset, k, v)
    dataset.updated_at = datetime.utcnow()
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@dataset_router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: str, session: AsyncSession = Depends(get_session)):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")
    await session.delete(dataset)
    await session.commit()


@dataset_router.post("/{dataset_id}/upload")
async def upload_dataset_file(
    dataset_id: str,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    upload_dir = Path(settings.APP_DATA_DIR) / "datasets"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{dataset_id}_{file.filename}"

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Count rows
    row_count = 0
    if file.filename.endswith(".jsonl"):
        for line in content.decode().splitlines():
            if line.strip():
                row_count += 1
    elif file.filename.endswith(".csv"):
        row_count = max(0, content.decode().count("\n") - 1)

    dataset.file_path = str(file_path)
    dataset.row_count = row_count
    session.add(dataset)
    await session.commit()

    return {"dataset_id": dataset_id, "file_path": str(file_path), "row_count": row_count}


@dataset_router.get("/{dataset_id}/preview")
async def preview_dataset(
    dataset_id: str,
    limit: int = 10,
    session: AsyncSession = Depends(get_session),
):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    frame = _load_dataset_frame(dataset)
    rows = frame.head(limit).replace({pd.NA: None}).to_dict(orient="records")

    field_mapping = {}
    try:
        field_mapping = json.loads(dataset.field_mapping_json or "{}")
    except Exception:
        field_mapping = {}

    return {
        "dataset_id": dataset_id,
        "rows": rows,
        "total": dataset.row_count,
        "columns": list(frame.columns),
        "field_mapping": field_mapping,
        "processing_config": json.loads(dataset.processing_config_json or "{}"),
        "split_config": json.loads(dataset.split_config_json or "{}"),
    }


@dataset_router.post("/{dataset_id}/process", response_model=DatasetResponse)
async def process_dataset(
    dataset_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    frame = _load_dataset_frame(dataset)
    processing_config = body.get("processing_config") or {}
    split_config = body.get("split_config") or {}

    rename_map = processing_config.get("rename_map") or {}
    drop_columns = processing_config.get("drop_columns") or []
    filters = processing_config.get("filters") or []
    deduplicate_by = processing_config.get("deduplicate_by") or []
    sample_size = processing_config.get("sample_size")

    if rename_map:
        frame = frame.rename(columns=rename_map)
    if drop_columns:
        frame = frame.drop(columns=[col for col in drop_columns if col in frame.columns])
    for rule in filters:
        field = rule.get("field")
        operator = rule.get("operator")
        value = rule.get("value")
        if not field or field not in frame.columns:
            continue
        if operator == "equals":
            frame = frame[frame[field] == value]
        elif operator == "contains":
            frame = frame[frame[field].astype(str).str.contains(str(value), na=False)]
        elif operator == "not_empty":
            frame = frame[frame[field].notna() & (frame[field].astype(str) != "")]
    if deduplicate_by:
        frame = frame.drop_duplicates(subset=[col for col in deduplicate_by if col in frame.columns])
    if sample_size:
        frame = frame.head(int(sample_size))

    output_format = body.get("output_format") or dataset.format or "jsonl"
    processed_dir = Path(settings.APP_DATA_DIR) / "datasets" / "processed"
    output_path = processed_dir / f"{dataset.id}.{output_format}"
    _write_dataset_frame(frame, output_path, output_format)

    dataset.output_path = str(output_path)
    dataset.row_count = len(frame.index)
    dataset.processing_config_json = json.dumps(processing_config, ensure_ascii=True)
    dataset.split_config_json = json.dumps(split_config, ensure_ascii=True)
    dataset.format = output_format
    dataset.status = "ready"
    dataset.updated_at = datetime.utcnow()
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@dataset_router.post("/{dataset_id}/export")
async def export_dataset(
    dataset_id: str,
    body: dict,
    session: AsyncSession = Depends(get_session),
):
    dataset = await session.get(Dataset, dataset_id)
    if not dataset:
        raise HTTPException(404, "Dataset not found")

    frame = _load_dataset_frame(dataset)
    export_format = body.get("format") or dataset.format or "jsonl"
    export_dir = Path(settings.APP_DATA_DIR) / "datasets" / "exports"
    export_path = export_dir / f"{dataset.id}.{export_format}"
    _write_dataset_frame(frame, export_path, export_format)
    dataset.output_path = str(export_path)
    dataset.updated_at = datetime.utcnow()
    session.add(dataset)
    await session.commit()

    return {
        "dataset_id": dataset.id,
        "export_path": str(export_path),
        "format": export_format,
        "row_count": len(frame.index),
    }


# Fine-tuning / LoRA
@finetune_router.get("/jobs", response_model=list[FineTuneJobResponse])
async def list_jobs(session: AsyncSession = Depends(get_session)):
    result = await session.exec(select(FineTuneJob).order_by(FineTuneJob.created_at.desc()))
    return result.all()


@finetune_router.post("/jobs", response_model=FineTuneJobResponse, status_code=201)
async def create_job(
    body: FineTuneJobCreate,
    background_tasks: BackgroundTasks,
    session: AsyncSession = Depends(get_session),
):
    job = FineTuneJob(**body.model_dump())
    session.add(job)
    await session.commit()
    await session.refresh(job)

    # Start training in background
    background_tasks.add_task(run_training_job, job.id)

    return job


@finetune_router.get("/jobs/{job_id}", response_model=FineTuneJobResponse)
async def get_job(job_id: str, session: AsyncSession = Depends(get_session)):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")
    return job


@finetune_router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(job_id: str, session: AsyncSession = Depends(get_session)):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")
    await session.delete(job)
    await session.commit()


@finetune_router.get("/jobs/{job_id}/logs")
async def get_job_logs(job_id: str, session: AsyncSession = Depends(get_session)):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")

    logs = []
    if job.log_path and Path(job.log_path).exists():
        with open(job.log_path) as f:
            logs = f.readlines()[-100:]  # last 100 lines

    return {"job_id": job_id, "logs": logs, "progress": job.progress}


@finetune_router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, session: AsyncSession = Depends(get_session)):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")
    if job.status == "running":
        job.status = "failed"
        job.error_msg = "Cancelled by user"
        session.add(job)
        await session.commit()
    return {"job_id": job_id, "status": job.status}


@finetune_router.post("/jobs/{job_id}/register-model")
async def register_model(
    job_id: str, body: dict, session: AsyncSession = Depends(get_session)
):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")
    if job.status != "completed":
        raise HTTPException(400, "Job is not completed yet")

    # Create a new model entry for the LoRA adapter
    from app.models import Provider
    providers = await session.exec(select(Provider).where(Provider.provider_type == "local"))
    local_provider = providers.first()

    if not local_provider:
        local_provider = Provider(
            name="Local Models",
            provider_type="local",
        )
        session.add(local_provider)
        await session.commit()
        await session.refresh(local_provider)

    from app.models import Model as ModelModel
    new_model = ModelModel(
        provider_id=local_provider.id,
        name=body.get("name", f"LoRA-{job.id[:8]}"),
        model_id=f"local/{job.id}",
        source_type="local",
    )
    session.add(new_model)

    job.registered_model_id = new_model.id
    session.add(job)
    await session.commit()

    return {"model_id": new_model.id, "job_id": job_id}


@finetune_router.post("/jobs/{job_id}/test-chat")
async def test_chat_with_job(
    job_id: str, body: dict, session: AsyncSession = Depends(get_session)
):
    job = await session.get(FineTuneJob, job_id)
    if not job:
        raise HTTPException(404, "Fine-tune job not found")
    return {
        "job_id": job_id,
        "message": body.get("message", ""),
        "response": f"[LoRA Model Test] Response to: {body.get('message', '')}",
    }


async def run_training_job(job_id: str):
    """Simulate LoRA training (replace with actual Unsloth/PEFT when GPU available)"""
    from app.core.database import async_session_factory
    async with async_session_factory() as session:
        job = await session.get(FineTuneJob, job_id)
        if not job:
            return

        job.status = "running"
        job.started_at = datetime.utcnow()

        output_dir = Path(settings.TRAINING_OUTPUT_DIR) / job_id
        output_dir.mkdir(parents=True, exist_ok=True)
        log_path = output_dir / "training.log"
        job.log_path = str(log_path)
        job.output_path = str(output_dir)
        session.add(job)
        await session.commit()

        # Simulate training steps
        with open(log_path, "w") as f:
            for step in range(1, 11):
                await asyncio.sleep(1)
                loss = 2.0 - (step * 0.15)
                log_line = f"Step {step}/10 | loss: {loss:.4f}\n"
                f.write(log_line)
                f.flush()

                async with async_session_factory() as inner_session:
                    j = await inner_session.get(FineTuneJob, job_id)
                    if j:
                        j.progress = step * 10
                        inner_session.add(j)
                        await inner_session.commit()

        async with async_session_factory() as final_session:
            j = await final_session.get(FineTuneJob, job_id)
            if j:
                j.status = "completed"
                j.progress = 100
                j.completed_at = datetime.utcnow()
                final_session.add(j)
                await final_session.commit()
