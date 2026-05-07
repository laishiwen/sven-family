import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { speechApi } from "@/lib/api";
import { isDesktop, electron } from "@/lib/electron";
import i18n from "@/i18n";

type SpeechCallbacks = {
  onText: (text: string, mode?: "append" | "replace") => void;
  onError?: (message: string) => void;
};

export type SpeechInputState = {
  isRecording: boolean;
  isSpeaking: boolean;
  voiceLevel: number;
  ready: boolean;
};

export function mergeUniqueVoiceChunk(base: string, chunk: string): string {
  const cleaned = String(chunk || "").trim();
  if (!cleaned) return base;
  if (!base) return cleaned;

  const normalize = (value: string) =>
    value.replace(/\s+/g, " ").trim().toLowerCase();
  const baseNorm = normalize(base);
  const chunkNorm = normalize(cleaned);
  if (baseNorm.endsWith(chunkNorm)) return base;

  const maxOverlap = Math.min(baseNorm.length, chunkNorm.length, 64);
  let overlap = 0;
  for (let size = maxOverlap; size >= 1; size -= 1) {
    if (baseNorm.slice(-size) === chunkNorm.slice(0, size)) {
      overlap = size;
      break;
    }
  }

  const appendPart = cleaned.slice(overlap).trim();
  if (!appendPart) return base;
  const needsSpace =
    /[A-Za-z0-9]$/.test(base) && /^[A-Za-z0-9]/.test(appendPart);
  return needsSpace ? `${base} ${appendPart}` : `${base}${appendPart}`;
}

function hasWebSpeechRecognition(): boolean {
  const anyWindow = window as any;
  return Boolean(
    anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition,
  );
}

export function useUnifiedSpeechInput(callbacks: SpeechCallbacks): {
  state: SpeechInputState;
  start: () => Promise<void>;
  stop: () => void;
} {
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const [ready, setReady] = useState(
    !isDesktop ? hasWebSpeechRecognition() : true,
  );

  const isRecordingRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionStopRef = useRef<(() => void) | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const controllersRef = useRef<Set<AbortController>>(new Set());
  const chunksRef = useRef<Blob[]>([]);
  const desktopLastTranscriptRef = useRef("");
  // Dedup Web Speech final results — restarts after VAD pause sometimes re-fire
  // the last phrase from the mic buffer. Identical consecutive finals are dropped.
  const webLastFinalRef = useRef("");

  const resetMeter = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setIsSpeaking(false);
    setVoiceLevel(0);
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Float32Array(analyser.fftSize);

    audioContextRef.current = ctx;
    analyserRef.current = analyser;

    const loop = () => {
      const node = analyserRef.current;
      if (!node || !isRecordingRef.current) return;
      node.getFloatTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i += 1) sum += buffer[i] * buffer[i];
      const rms = Math.sqrt(sum / buffer.length);
      setVoiceLevel(Math.min(rms * 6, 1));
      setIsSpeaking(rms > 0.025);
      rafRef.current = window.requestAnimationFrame(loop);
    };

    rafRef.current = window.requestAnimationFrame(loop);
  }, []);

  const stop = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        // ignore stop race
      }
    }
    recorderRef.current = null;

    for (const controller of controllersRef.current) {
      controller.abort();
    }
    controllersRef.current.clear();
    queueRef.current = Promise.resolve();
    chunksRef.current = [];
    desktopLastTranscriptRef.current = "";
    webLastFinalRef.current = "";

    if (recognitionStopRef.current) {
      recognitionStopRef.current();
      recognitionStopRef.current = null;
    }

    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    resetMeter();
  }, [resetMeter]);

  const startDesktop = useCallback(async () => {
    try {
      // Use IPC when available (faster: no browser HTTP overhead)
      const ensured = electron
        ? await electron.speechEnsure()
        : (await speechApi.ensure()).data;
      setReady(Boolean(ensured?.ready));
    } catch (error: any) {
      const detail = String(
        error?.message || error?.response?.data?.detail || "",
      );
      if (detail === "model_not_ready") {
        setReady(false);
        callbacks.onError?.(i18n.t("speech.errors.model-not-ready"));
      } else {
        callbacks.onError?.(i18n.t("speech.errors.desktop-init-failed"));
      }
      throw error;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
      .filter((value) => MediaRecorder.isTypeSupported(value))
      .at(0);
    const recorder = mimeType
      ? new MediaRecorder(stream, { mimeType })
      : new MediaRecorder(stream);

    recorder.ondataavailable = (event) => {
      const chunk = event.data;
      if (!chunk || chunk.size === 0) return;
      chunksRef.current.push(chunk);
      if (!isRecordingRef.current) return;

      queueRef.current = queueRef.current.then(async () => {
        if (!isRecordingRef.current) return;
        if (!chunksRef.current.length) return;

        const containerType = recorder.mimeType || chunk.type || "audio/webm";
        const merged = new Blob(chunksRef.current, { type: containerType });
        if (merged.size < 2048) return;

        const controller = new AbortController();
        controllersRef.current.add(controller);
        try {
          const chunkType = String(containerType || "").toLowerCase();
          const suffix = chunkType.includes("mp4")
            ? ".mp4"
            : chunkType.includes("ogg")
              ? ".ogg"
              : ".webm";
          const filename = `stream-current${suffix}`;

          let text: string;
          if (electron?.speechTranscribe) {
            // IPC path: ArrayBuffer transfer avoids browser multipart overhead
            const ab = await merged.arrayBuffer();
            const result = await electron.speechTranscribe(ab, filename);
            text = String(result?.text || "").trim();
          } else {
            const response = await speechApi.transcribe(
              merged,
              filename,
              controller.signal,
            );
            text = String(response.data?.text || "").trim();
          }

          if (text && text !== desktopLastTranscriptRef.current) {
            desktopLastTranscriptRef.current = text;
            // Desktop sends cumulative audio each window, so the backend returns
            // the full transcript from recording start. No comma insertion needed
            // here — faster-whisper already adds punctuation at natural pauses.
            callbacks.onText(text, "replace");
          }
        } catch (error: any) {
          const detail = String(
            error?.message || error?.response?.data?.detail || "",
          );
          if (detail === "model_not_ready") {
            setReady(false);
            callbacks.onError?.(i18n.t("speech.errors.model-not-ready"));
            stop();
          }
        } finally {
          controllersRef.current.delete(controller);
        }
      });
    };

    streamRef.current = stream;
    recorderRef.current = recorder;
    isRecordingRef.current = true;
    setIsRecording(true);
    startMeter(stream);
    recorder.start(1200);
  }, [callbacks, startMeter, stop]);

  const startWeb = useCallback(async () => {
    const anyWindow = window as any;
    const SpeechRecognitionCtor =
      anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      setReady(false);
      callbacks.onError?.(i18n.t("speech.errors.web-not-supported"));
      throw new Error("speech_recognition_not_supported");
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "zh-CN";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event: any) => {
      let finalChunk = "";
      let interimChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = String(result?.[0]?.transcript || "").trim();
        if (!text) continue;
        if (result.isFinal) {
          finalChunk += text;
        } else {
          interimChunk += text;
        }
      }

      if (finalChunk) {
        // Drop if identical to the last final — browser restarts can re-emit
        // the previous phrase from the mic buffer after a VAD-triggered onend.
        if (finalChunk === webLastFinalRef.current) {
          // still update isSpeaking below
        } else {
          webLastFinalRef.current = finalChunk;
          callbacks.onText(finalChunk);
        }
      }
      if (interimChunk) {
        callbacks.onText(interimChunk);
        setIsSpeaking(true);
        setVoiceLevel(0.5);
      }
    };

    recognition.onerror = (event: any) => {
      const code = String(event?.error || "unknown");
      if (code === "aborted" || code === "no-speech") return;
      callbacks.onError?.(i18n.t("speech.errors.recognition-failed", { code }));
      stop();
    };

    recognition.onend = () => {
      if (!isRecordingRef.current) return;
      try {
        recognition.start();
      } catch {
        // ignore restart failures
      }
    };

    recognition.start();
    recognitionStopRef.current = () => {
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
      } catch {
        // ignore
      }
    };

    isRecordingRef.current = true;
    setIsRecording(true);
    setIsSpeaking(false);
    setVoiceLevel(0);
  }, [callbacks, stop]);

  const start = useCallback(async () => {
    if (isRecordingRef.current) return;
    if (isDesktop) {
      await startDesktop();
      return;
    }
    await startWeb();
  }, [startDesktop, startWeb]);

  useEffect(() => {
    if (!isDesktop) {
      setReady(hasWebSpeechRecognition());
      return;
    }
    let mounted = true;
    void speechApi
      .status()
      .then((res) => {
        if (!mounted) return;
        setReady(Boolean(res.data?.ready));
      })
      .catch(() => {
        if (!mounted) return;
        setReady(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  return {
    state: useMemo(
      () => ({ isRecording, isSpeaking, voiceLevel, ready }),
      [isRecording, isSpeaking, voiceLevel, ready],
    ),
    start,
    stop,
  };
}
