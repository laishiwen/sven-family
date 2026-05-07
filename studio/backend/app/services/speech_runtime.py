from __future__ import annotations

import os
import shlex
import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any


@dataclass(frozen=True)
class EnginePlan:
    id: str
    label: str
    model: str
    priority: int


ENGINE_PLANS = {
    "sherpa-onnx": EnginePlan(
        id="sherpa-onnx",
        label="Sherpa ONNX (default)",
        model="small",
        priority=1,
    ),
    "whisper-cpp": EnginePlan(
        id="whisper-cpp",
        label="Whisper.cpp (high-accuracy)",
        model="medium",
        priority=2,
    ),
    "vosk": EnginePlan(
        id="vosk",
        label="Vosk (fallback)",
        model="base",
        priority=3,
    ),
}

ENGINE_NATIVE_TEMPLATE_ENV = {
    "sherpa-onnx": "SPEECH_ENGINE_SHERPA_ONNX_CMD",
    "whisper-cpp": "SPEECH_ENGINE_WHISPER_CPP_CMD",
    "vosk": "SPEECH_ENGINE_VOSK_CMD",
}


def _env_flag(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, "")).strip().lower()
    if not raw:
        return default
    return raw in {"1", "true", "yes", "on"}


def detect_device_tier() -> str:
    cpu = os.cpu_count() or 4
    mem_gb = 8.0

    try:
        page_size = os.sysconf("SC_PAGE_SIZE")
        pages = os.sysconf("SC_PHYS_PAGES")
        mem_gb = (page_size * pages) / (1024 ** 3)
    except Exception:
        pass

    if cpu <= 4 or mem_gb < 8:
        return "low"
    if cpu >= 10 and mem_gb >= 16:
        return "high"
    return "standard"


def resolve_engine_order(preferred_engine: str | None = None, tier: str | None = None) -> list[str]:
    if preferred_engine and preferred_engine in ENGINE_PLANS:
        return [preferred_engine]

    effective_tier = (tier or detect_device_tier()).lower()
    if effective_tier == "high":
        return ["sherpa-onnx", "whisper-cpp", "vosk"]
    if effective_tier == "low":
        return ["vosk", "sherpa-onnx", "whisper-cpp"]
    return ["sherpa-onnx", "vosk", "whisper-cpp"]


class FasterWhisperProfile:
    def __init__(self, plan: EnginePlan):
        self.plan = plan
        self._model: Any = None

    def is_available(self) -> bool:
        # Optional per-engine switch to disable an engine without code changes.
        env_key = f"SPEECH_ENGINE_{self.plan.id.upper().replace('-', '_')}_ENABLED"
        if not _env_flag(env_key, True):
            return False
        try:
            from faster_whisper import WhisperModel  # noqa: F401
        except Exception:
            return False
        return True

    def ensure_ready(self) -> None:
        if self._model is not None:
            return
        from faster_whisper import WhisperModel

        # Uses faster-whisper runtime profile to emulate a unified offline engine API.
        self._model = WhisperModel(self.plan.model, device="auto", compute_type="int8")

    def transcribe(self, audio_path: str) -> str:
        return self.transcribe_with_metrics(audio_path)["text"]

    def transcribe_with_metrics(self, audio_path: str) -> dict[str, Any]:
        self.ensure_ready()
        assert self._model is not None
        started_at = time.perf_counter()
        first_token_at: float | None = None
        text_parts: list[str] = []
        # initial_prompt nudges Whisper toward Simplified Chinese output;
        # zhconv conversion below is the hard guarantee.
        segments, _ = self._model.transcribe(
            audio_path,
            beam_size=1,
            vad_filter=True,
            language="zh",
            condition_on_previous_text=False,
            initial_prompt="以下是普通话的句子，使用简体中文。",
        )
        for seg in segments:
            if first_token_at is None and str(seg.text or "").strip():
                first_token_at = time.perf_counter()
            text_parts.append(seg.text)
        finished_at = time.perf_counter()
        raw_text = "".join(text_parts).strip()
        try:
            import zhconv
            simplified = zhconv.convert(raw_text, "zh-hans")
        except Exception:
            simplified = raw_text
        return {
            "text": simplified,
            "latency_ms": (finished_at - started_at) * 1000,
            "first_token_ms": ((first_token_at or finished_at) - started_at) * 1000,
            "backend": "faster-whisper",
        }


class CommandEngineProfile:
    def __init__(self, plan: EnginePlan):
        self.plan = plan

    @property
    def template_env(self) -> str:
        return ENGINE_NATIVE_TEMPLATE_ENV[self.plan.id]

    def _build_command(self, audio_path: str) -> list[str] | None:
        template = str(os.getenv(self.template_env, "")).strip()
        if not template:
            return None
        rendered = template.replace("{input}", audio_path)
        try:
            parts = shlex.split(rendered)
        except Exception:
            return None
        if not parts:
            return None
        return parts

    def is_available(self) -> bool:
        cmd = self._build_command("/tmp/audio.wav")
        if not cmd:
            return False
        executable = cmd[0]
        if os.path.isabs(executable):
            return Path(executable).exists()
        return shutil.which(executable) is not None

    def ensure_ready(self) -> None:
        return

    def transcribe_with_metrics(self, audio_path: str) -> dict[str, Any]:
        cmd = self._build_command(audio_path)
        if not cmd:
            raise RuntimeError(f"native_template_missing:{self.plan.id}")

        timeout_sec = int(os.getenv("SPEECH_ENGINE_NATIVE_TIMEOUT_SEC", "120"))
        started_at = time.perf_counter()
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout_sec,
            check=False,
        )
        finished_at = time.perf_counter()
        if result.returncode != 0:
            stderr = (result.stderr or "").strip()
            raise RuntimeError(f"native_engine_failed:{self.plan.id}:{stderr[:240]}")

        text = (result.stdout or "").strip()
        return {
            "text": text,
            "latency_ms": (finished_at - started_at) * 1000,
            "first_token_ms": (finished_at - started_at) * 1000,
            "backend": "native-cmd",
        }


_PYTHON_FALLBACK_DISABLED = _env_flag("SPEECH_DISABLE_PYTHON_FALLBACK", default=False)


class EngineAdapter:
    def __init__(self, plan: EnginePlan):
        self.plan = plan
        self.native = CommandEngineProfile(plan)
        self.fallback: FasterWhisperProfile | None = (
            None if _PYTHON_FALLBACK_DISABLED else FasterWhisperProfile(plan)
        )

    def is_native_available(self) -> bool:
        return self.native.is_available()

    def is_native_only(self) -> bool:
        env_key = f"SPEECH_ENGINE_{self.plan.id.upper().replace('-', '_')}_NATIVE_ONLY"
        return _env_flag(env_key, False)

    def is_available(self) -> bool:
        if self.is_native_only():
            return self.is_native_available()
        if self.is_native_available():
            return True
        if self.fallback is not None:
            return self.fallback.is_available()
        return False

    def ensure_ready(self) -> None:
        if self.is_native_available():
            self.native.ensure_ready()
            return
        if self.fallback is None or self.is_native_only():
            raise RuntimeError(f"native_only_unavailable:{self.plan.id}")
        self.fallback.ensure_ready()

    def transcribe_with_metrics(self, audio_path: str) -> dict[str, Any]:
        if self.is_native_available():
            return self.native.transcribe_with_metrics(audio_path)
        if self.fallback is None or self.is_native_only():
            raise RuntimeError(f"native_only_unavailable:{self.plan.id}")
        return self.fallback.transcribe_with_metrics(audio_path)


class OfflineSpeechRuntime:
    def __init__(self):
        self._lock = Lock()
        self._engines = {engine_id: EngineAdapter(plan) for engine_id, plan in ENGINE_PLANS.items()}
        self._active_engine_id: str | None = None

    def _pick_engine(self, preferred_engine: str | None = None) -> str | None:
        for engine_id in resolve_engine_order(preferred_engine=preferred_engine):
            engine = self._engines[engine_id]
            if engine.is_available():
                return engine_id
        return None

    def status(self) -> dict[str, Any]:
        available = [engine_id for engine_id, engine in self._engines.items() if engine.is_available()]
        native_available = [engine_id for engine_id, engine in self._engines.items() if engine.is_native_available()]
        active_plan = ENGINE_PLANS.get(self._active_engine_id) if self._active_engine_id else None
        return {
            "ready": self._active_engine_id is not None,
            "downloading": False,
            "download_started": False,
            "error": None if available else "model_not_ready",
            "model": active_plan.model if active_plan else "",
            "active_engine": self._active_engine_id,
            "device_tier": detect_device_tier(),
            "candidates": available,
            "native_candidates": native_available,
            "engine_order": resolve_engine_order(),
        }

    def ensure(self, preferred_engine: str | None = None) -> dict[str, Any]:
        with self._lock:
            target = self._pick_engine(preferred_engine)
            if not target:
                return self.status()

            profile = self._engines[target]
            profile.ensure_ready()
            self._active_engine_id = target
            return self.status()

    def transcribe_file(self, file_path: str, preferred_engine: str | None = None) -> tuple[str, str]:
        metrics = self.transcribe_file_with_metrics(file_path, preferred_engine=preferred_engine)
        return str(metrics.get("text") or ""), str(metrics.get("engine") or "")

    def transcribe_file_with_metrics(self, file_path: str, preferred_engine: str | None = None) -> dict[str, Any]:
        with self._lock:
            target = self._active_engine_id or self._pick_engine(preferred_engine)
            if not target:
                raise RuntimeError("model_not_ready")

            profile = self._engines[target]
            profile.ensure_ready()
            self._active_engine_id = target
            result = profile.transcribe_with_metrics(file_path)
            result["engine"] = target
            return result

    def compare_engines(self, file_path: str, engines: list[str]) -> list[dict[str, Any]]:
        reports: list[dict[str, Any]] = []
        for engine in engines:
            if engine not in self._engines:
                reports.append({"engine": engine, "error": "unknown_engine"})
                continue
            try:
                report = self.transcribe_file_with_metrics(file_path, preferred_engine=engine)
            except Exception as exc:
                reports.append({"engine": engine, "error": str(exc)})
                continue
            reports.append(report)
        return reports


runtime = OfflineSpeechRuntime()


def write_upload_to_temp(upload_name: str, payload: bytes) -> str:
    suffix = Path(upload_name or "chunk.webm").suffix or ".webm"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(payload)
        return tmp.name
