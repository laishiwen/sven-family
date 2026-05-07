from __future__ import annotations

import argparse
import json
import os
import resource
import sys
import time
import wave
from pathlib import Path
from statistics import mean

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from app.services.speech_runtime import runtime


def _audio_duration_seconds(audio_path: Path) -> float | None:
    if audio_path.suffix.lower() == ".wav":
        with wave.open(str(audio_path), "rb") as wav:
            frames = wav.getnframes()
            rate = wav.getframerate()
            if rate <= 0:
                return None
            return frames / float(rate)
    return None


def _run_once(audio_path: Path, engine: str, audio_duration: float | None) -> dict:
    cpu_start = time.process_time()
    rss_start = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    wall_start = time.perf_counter()

    report = runtime.transcribe_file_with_metrics(str(audio_path), preferred_engine=engine)

    wall_end = time.perf_counter()
    rss_end = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    cpu_end = time.process_time()

    elapsed = (wall_end - wall_start) * 1000
    cpu_ms = (cpu_end - cpu_start) * 1000

    rtf = None
    if audio_duration and audio_duration > 0:
        rtf = (elapsed / 1000.0) / audio_duration

    return {
        "engine": report.get("engine", engine),
        "backend": report.get("backend"),
        "latency_ms": float(report.get("latency_ms") or elapsed),
        "first_token_ms": float(report.get("first_token_ms") or elapsed),
        "cpu_ms": cpu_ms,
        "rss_delta_kb": int(rss_end - rss_start),
        "rtf": rtf,
        "text_chars": len(str(report.get("text") or "")),
        "text_preview": str(report.get("text") or "")[:120],
    }


def _aggregate(samples: list[dict]) -> dict:
    return {
        "runs": len(samples),
        "engine": samples[0]["engine"],
        "backend": samples[0].get("backend"),
        "latency_ms_avg": mean(item["latency_ms"] for item in samples),
        "first_token_ms_avg": mean(item["first_token_ms"] for item in samples),
        "cpu_ms_avg": mean(item["cpu_ms"] for item in samples),
        "rss_delta_kb_max": max(item["rss_delta_kb"] for item in samples),
        "rtf_avg": mean(item["rtf"] for item in samples if item["rtf"] is not None)
        if any(item["rtf"] is not None for item in samples)
        else None,
        "text_chars_avg": mean(item["text_chars"] for item in samples),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Offline speech benchmark (latency/RTF/CPU/RSS)")
    parser.add_argument("--audio", required=True, help="Path to audio file (wav/webm/mp4 supported by runtime)")
    parser.add_argument(
        "--engines",
        default="sherpa-onnx,whisper-cpp,vosk",
        help="Comma-separated engines for A/B compare",
    )
    parser.add_argument("--warmup", type=int, default=1, help="Warmup runs per engine")
    parser.add_argument("--runs", type=int, default=3, help="Measured runs per engine")
    args = parser.parse_args()

    audio_path = Path(args.audio).expanduser().resolve()
    if not audio_path.exists():
        raise SystemExit(f"Audio file not found: {audio_path}")

    engines = [item.strip() for item in args.engines.split(",") if item.strip()]
    audio_duration = _audio_duration_seconds(audio_path)

    output = {
        "audio": str(audio_path),
        "audio_duration_sec": audio_duration,
        "device_tier": runtime.status().get("device_tier"),
        "native_candidates": runtime.status().get("native_candidates"),
        "samples": {},
        "summary": {},
    }

    for engine in engines:
        if args.warmup > 0:
            for _ in range(args.warmup):
                try:
                    _run_once(audio_path, engine, audio_duration)
                except Exception:
                    break

        samples = []
        for _ in range(max(1, args.runs)):
            try:
                sample = _run_once(audio_path, engine, audio_duration)
            except Exception as exc:
                samples.append({"engine": engine, "error": str(exc)})
                continue
            samples.append(sample)

        output["samples"][engine] = samples
        ok_samples = [item for item in samples if "error" not in item]
        if ok_samples:
            output["summary"][engine] = _aggregate(ok_samples)
        else:
            output["summary"][engine] = {"engine": engine, "error": "all_runs_failed"}

    print(json.dumps(output, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
