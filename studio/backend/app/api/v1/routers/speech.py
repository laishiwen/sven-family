from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.services.speech_runtime import runtime, write_upload_to_temp


router = APIRouter(prefix="/speech", tags=["Speech"])


@router.get("/status")
async def speech_status():
    return runtime.status()


@router.post("/ensure")
async def speech_ensure(
    preferred_engine: str | None = Query(
        default=None,
        description="Optional engine override: sherpa-onnx | whisper-cpp | vosk",
    )
):
    state = runtime.ensure(preferred_engine=preferred_engine)
    if not state.get("ready"):
        raise HTTPException(status_code=503, detail="model_not_ready")
    return state


@router.post("/transcribe")
async def speech_transcribe(
    audio: UploadFile = File(...),
    preferred_engine: str | None = Query(default=None),
):
    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="empty_audio")

    temp_path = write_upload_to_temp(audio.filename or "chunk.webm", payload)
    try:
        text, engine = runtime.transcribe_file(temp_path, preferred_engine=preferred_engine)
    except RuntimeError as exc:
        if str(exc) == "model_not_ready":
            raise HTTPException(status_code=503, detail="model_not_ready") from exc
        raise HTTPException(status_code=500, detail="speech_runtime_error") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"transcribe_failed: {exc}") from exc
    finally:
        Path(temp_path).unlink(missing_ok=True)

    return {"text": text, "engine": engine}


@router.post("/ab-compare")
async def speech_ab_compare(
    audio: UploadFile = File(...),
    engines: str = Query(default="sherpa-onnx,whisper-cpp,vosk"),
):
    payload = await audio.read()
    if not payload:
        raise HTTPException(status_code=400, detail="empty_audio")

    chosen_engines = [item.strip() for item in engines.split(",") if item.strip()]
    if not chosen_engines:
        raise HTTPException(status_code=400, detail="empty_engines")

    temp_path = write_upload_to_temp(audio.filename or "chunk.webm", payload)
    try:
        reports = runtime.compare_engines(temp_path, chosen_engines)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ab_compare_failed: {exc}") from exc
    finally:
        Path(temp_path).unlink(missing_ok=True)

    return {
        "device_tier": runtime.status().get("device_tier"),
        "reports": reports,
    }
