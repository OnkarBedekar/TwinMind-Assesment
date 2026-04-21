import { useCallback, useEffect, useRef, useState } from "react";

export interface RecorderChunk {
  blob: Blob;
  mimeType: string;
  start_ts: number;
  end_ts: number;
  filename: string;
}

interface UseRecorderOptions {
  chunkSeconds: number;
  onChunk: (chunk: RecorderChunk) => void | Promise<void>;
  onError?: (err: string) => void;
}

const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of CANDIDATE_MIME_TYPES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
    }
  }
  return null;
}

function extensionFor(mime: string): string {
  if (mime.startsWith("audio/webm")) return "webm";
  if (mime.startsWith("audio/mp4")) return "m4a";
  if (mime.startsWith("audio/ogg")) return "ogg";
  return "bin";
}

export function useRecorder({ chunkSeconds, onChunk, onError }: UseRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [level, setLevel] = useState(0);
  const [supported, setSupported] = useState<boolean>(true);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const mimeRef = useRef<string>("");
  const chunkStartRef = useRef<number>(0);
  const rotationTimerRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const stopRequestedRef = useRef<boolean>(false);
  const pendingChunkRef = useRef<Promise<void> | null>(null);
  const onChunkRef = useRef(onChunk);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onChunkRef.current = onChunk;
  }, [onChunk]);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    setSupported(typeof MediaRecorder !== "undefined" && !!pickMimeType());
  }, []);

  const cleanupMeter = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const startMeter = useCallback((stream: MediaStream) => {
    try {
      const AC =
        (window.AudioContext as typeof AudioContext) ||
        ((window as any).webkitAudioContext as typeof AudioContext);
      const ctx = new AC();
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      const buf = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
    }
  }, []);

  const buildRecorder = useCallback(
    (stream: MediaStream) => {
      const mime = mimeRef.current;
      const rec = new MediaRecorder(stream, { mimeType: mime, audioBitsPerSecond: 48000 });
      const chunks: BlobPart[] = [];
      chunkStartRef.current = Date.now() / 1000;

      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) chunks.push(ev.data);
      };

      rec.onstop = () => {
        const end_ts = Date.now() / 1000;
        const start_ts = chunkStartRef.current;
        if (chunks.length > 0) {
          const blob = new Blob(chunks, { type: mime });
          if (blob.size > 1200) {
            const ext = extensionFor(mime);
            pendingChunkRef.current = Promise.resolve(
              onChunkRef.current({
                blob,
                mimeType: mime,
                start_ts,
                end_ts,
                filename: `chunk-${Math.floor(start_ts)}.${ext}`,
              }),
            ).catch(() => {});
          } else {
            pendingChunkRef.current = null;
          }
        } else {
          pendingChunkRef.current = null;
        }
        if (!stopRequestedRef.current && streamRef.current) {
          const next = buildRecorder(streamRef.current);
          recorderRef.current = next;
          next.start();
          scheduleRotation();
        } else {
          recorderRef.current = null;
        }
      };

      return rec;
    },
    [],
  );

  const scheduleRotation = useCallback(() => {
    if (rotationTimerRef.current) {
      window.clearTimeout(rotationTimerRef.current);
    }
    rotationTimerRef.current = window.setTimeout(() => {
      const rec = recorderRef.current;
      if (rec && rec.state === "recording") {
        rec.stop();
      }
    }, Math.max(1000, chunkSeconds * 1000));
  }, [chunkSeconds]);

  const start = useCallback(async () => {
    if (isRecording) return;
    const mime = pickMimeType();
    if (!mime) {
      onErrorRef.current?.("MediaRecorder not supported in this browser");
      return;
    }
    mimeRef.current = mime;
    stopRequestedRef.current = false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      startMeter(stream);

      const rec = buildRecorder(stream);
      recorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      scheduleRotation();
    } catch (e: any) {
      onErrorRef.current?.(
        `Mic permission denied or unavailable: ${e?.message ?? String(e)}`,
      );
    }
  }, [isRecording, buildRecorder, scheduleRotation, startMeter]);

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    if (rotationTimerRef.current) {
      window.clearTimeout(rotationTimerRef.current);
      rotationTimerRef.current = null;
    }
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    cleanupMeter();
    setLevel(0);
    setIsRecording(false);
  }, [cleanupMeter]);

  const flushChunk = useCallback(async (): Promise<void> => {
    const rec = recorderRef.current;
    if (!rec || rec.state !== "recording") return;
    await new Promise<void>((resolve) => {
      const originalOnStop = rec.onstop;
      rec.onstop = (ev) => {
        if (originalOnStop) (originalOnStop as any).call(rec, ev);
        resolve();
      };
      if (rotationTimerRef.current) {
        window.clearTimeout(rotationTimerRef.current);
        rotationTimerRef.current = null;
      }
      rec.stop();
    });
    await pendingChunkRef.current;
  }, []);

  useEffect(() => {
    return () => {
      stopRequestedRef.current = true;
      if (rotationTimerRef.current) window.clearTimeout(rotationTimerRef.current);
      const rec = recorderRef.current;
      if (rec && rec.state !== "inactive") {
        try {
          rec.stop();
        } catch {
        }
      }
      const stream = streamRef.current;
      if (stream) stream.getTracks().forEach((t) => t.stop());
      cleanupMeter();
    };
  }, [cleanupMeter]);

  return { isRecording, level, supported, start, stop, flushChunk };
}
