import { useEffect, useRef } from "react";
import type { TranscriptChunk } from "../lib/types";

interface Props {
  transcript: TranscriptChunk[];
  isRecording: boolean;
  level: number;
  supported: boolean;
  onToggle: () => void;
  startedAt: number | null;
}

function formatRelative(fromSec: number, anchor: number | null): string {
  if (!anchor) return "";
  const rel = Math.max(0, fromSec - anchor);
  const m = Math.floor(rel / 60);
  const s = Math.floor(rel % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TranscriptColumn({
  transcript,
  isRecording,
  level,
  supported,
  onToggle,
  startedAt,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [transcript.length]);

  return (
    <section className="flex min-h-0 flex-col rounded-2xl bg-ink-900/70 ring-1 ring-white/5 shadow-xl backdrop-blur">
      <header className="flex items-center justify-between border-b border-white/5 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-slate-200">
            Transcript
          </h2>
          <p className="text-[13px] text-slate-300">
            {isRecording
              ? "Listening - chunks transcribe every ~30s"
              : "Tap the mic to start"}
          </p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          disabled={!supported}
          className={[
            "group relative flex h-12 w-12 items-center justify-center rounded-full transition",
            isRecording
              ? "bg-red-500 hover:bg-red-400 shadow-lg shadow-red-500/30"
              : "bg-accent-500 hover:bg-accent-400 shadow-lg shadow-accent-500/30",
            !supported ? "cursor-not-allowed opacity-50" : "",
          ].join(" ")}
          title={
            !supported
              ? "MediaRecorder unsupported in this browser"
              : isRecording
                ? "Stop recording"
                : "Start recording"
          }
        >
          {isRecording ? (
            <span className="block h-3.5 w-3.5 rounded-sm bg-white" />
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5 fill-white"
              aria-hidden="true"
            >
              <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
              <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
            </svg>
          )}
          {isRecording && (
            <span
              className="pointer-events-none absolute -inset-1 rounded-full ring-2 ring-red-400/50"
              style={{
                transform: `scale(${1 + level * 0.4})`,
                transition: "transform 80ms linear",
              }}
            />
          )}
        </button>
      </header>

      <div
        ref={scrollRef}
        className="scroll-slim min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[15px] leading-relaxed"
      >
        {transcript.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center text-slate-500">
            <div>
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
                <svg viewBox="0 0 24 24" className="h-5 w-5 fill-slate-400">
                  <path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3z" />
                  <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
                </svg>
              </div>
              <p className="text-[15px] text-slate-300">Your transcript will appear here.</p>
              <p className="mt-1 text-[13px] text-slate-400">
                Press the mic and start talking.
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-3">
            {transcript.map((c) => (
              <li key={c.chunk_id} className="flex gap-3">
                <span className="mt-0.5 flex-shrink-0 font-mono text-[11px] text-slate-500">
                  {formatRelative(c.start_ts, startedAt)}
                </span>
                <span className="text-slate-200">{c.text}</span>
              </li>
            ))}
            {isRecording && (
              <li className="flex items-center gap-2 pl-[40px] text-xs text-slate-500">
                <span className="rec-dot inline-block h-1.5 w-1.5 rounded-full bg-red-500" />
                <span>Listening…</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
