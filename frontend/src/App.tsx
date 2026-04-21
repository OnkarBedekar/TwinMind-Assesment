import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "./state/SessionContext";
import { useRecorder } from "./hooks/useRecorder";
import { useSuggestions } from "./hooks/useSuggestions";
import { useChat } from "./hooks/useChat";
import { uploadTranscribeChunk } from "./lib/api";
import { TranscriptColumn } from "./components/TranscriptColumn";
import { SuggestionsColumn } from "./components/SuggestionsColumn";
import { ChatColumn } from "./components/ChatColumn";
import { SettingsModal } from "./components/SettingsModal";
import { ExportButton } from "./components/ExportButton";
import type { Suggestion } from "./lib/types";

export default function App() {
  const {
    sessionId,
    startedAt,
    transcript,
    batches,
    chat,
    settings,
    settingsReady,
    lastError,
    addTranscriptChunk,
    setError,
  } = useSession();

  const [settingsOpen, setSettingsOpen] = useState(false);

  const hasApiKey = useMemo(
    () => !!(settings.groq_api_key && settings.groq_api_key.trim()),
    [settings.groq_api_key],
  );

  useEffect(() => {
    if (settingsReady && !hasApiKey) setSettingsOpen(true);
  }, [settingsReady, hasApiKey]);

  const { sendMessage, sendSuggestion, streaming } = useChat();

  const handleChunk = useCallback(
    async (chunk: {
      blob: Blob;
      filename: string;
      start_ts: number;
      end_ts: number;
    }) => {
      if (!sessionId) return;
      if (!settings.groq_api_key) {
        setError("Add your Groq API key in Settings to transcribe audio.");
        return;
      }
      try {
        const tc = await uploadTranscribeChunk(settings, {
          session_id: sessionId,
          start_ts: chunk.start_ts,
          end_ts: chunk.end_ts,
          blob: chunk.blob,
          filename: chunk.filename,
        });
        if (tc) addTranscriptChunk(tc);
      } catch (e: any) {
        setError(`Transcription failed: ${e?.message ?? String(e)}`);
      }
    },
    [sessionId, settings, addTranscriptChunk, setError],
  );

  const recorder = useRecorder({
    chunkSeconds: settings.chunk_seconds || 30,
    onChunk: handleChunk,
    onError: (err) => setError(err),
  });

  const suggestions = useSuggestions({
    isRecording: recorder.isRecording,
    flushChunk: recorder.flushChunk,
  });

  const onToggleMic = useCallback(() => {
    if (recorder.isRecording) {
      recorder.stop();
    } else {
      if (!settings.groq_api_key) {
        setError("Add your Groq API key in Settings first.");
        setSettingsOpen(true);
        return;
      }
      recorder.start();
    }
  }, [recorder, settings.groq_api_key, setError]);

  const onPickSuggestion = useCallback(
    (s: Suggestion) => {
      sendSuggestion(s.id);
    },
    [sendSuggestion],
  );

  const onManualRefresh = useCallback(() => {
    suggestions.refresh({ flush: recorder.isRecording });
  }, [suggestions, recorder.isRecording]);

  return (
    <div className="flex h-screen w-screen flex-col">
      <Header
        recording={recorder.isRecording}
        onOpenSettings={() => setSettingsOpen(true)}
        hasApiKey={hasApiKey}
      />

      {lastError && (
        <div className="mx-4 mt-2 flex items-start justify-between gap-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-200 ring-1 ring-red-500/30">
          <span className="leading-relaxed">{lastError}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-200/70 hover:text-red-100"
            aria-label="Dismiss"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
              <path d="M18.3 5.71 12 12l6.3 6.29-1.42 1.42L10.59 13.4 4.29 19.7 2.88 18.29 9.17 12 2.88 5.71 4.29 4.29l6.3 6.3 6.29-6.3z" />
            </svg>
          </button>
        </div>
      )}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 md:grid-cols-12 md:gap-2 md:p-2 lg:gap-2 lg:px-2">
        <div className="flex min-h-0 md:col-span-3">
          <TranscriptColumn
            transcript={transcript}
            isRecording={recorder.isRecording}
            level={recorder.level}
            supported={recorder.supported}
            onToggle={onToggleMic}
            startedAt={startedAt}
          />
        </div>
        <div className="flex min-h-0 md:col-span-4">
          <SuggestionsColumn
            batches={batches}
            loading={suggestions.loading}
            onRefresh={onManualRefresh}
            onPick={onPickSuggestion}
            hasApiKey={hasApiKey}
          />
        </div>
        <div className="flex min-h-0 md:col-span-5">
          <ChatColumn
            chat={chat}
            streaming={streaming}
            onSend={sendMessage}
            hasApiKey={hasApiKey}
          />
        </div>
      </main>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

function Header({
  recording,
  onOpenSettings,
  hasApiKey,
}: {
  recording: boolean;
  onOpenSettings: () => void;
  hasApiKey: boolean;
}) {
  return (
    <header className="flex items-center justify-between border-b border-white/5 px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-accent-500 to-sky-400 font-black text-ink-950 shadow-lg shadow-accent-500/30">
          TM
        </div>
        <div>
          <div className="text-sm font-semibold text-slate-100">
            TwinMind - Live Suggestions
          </div>
          <div className="text-[11px] text-slate-500">
            Whisper Large V3 · GPT-OSS 120B · via Groq
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] ring-1 ${
            recording
              ? "bg-red-500/10 text-red-300 ring-red-500/30"
              : "bg-white/5 text-slate-400 ring-white/10"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              recording ? "rec-dot bg-red-400" : "bg-slate-500"
            }`}
          />
          {recording ? "Recording" : "Idle"}
        </div>
        <ExportButton />
        <button
          type="button"
          onClick={onOpenSettings}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium ring-1 transition ${
            hasApiKey
              ? "bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10"
              : "bg-amber-500/10 text-amber-200 ring-amber-500/30 hover:bg-amber-500/20"
          }`}
          title="Settings (API key, prompts, windows)"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current">
            <path d="M19.14 12.94a7.14 7.14 0 0 0 .05-.94 7.14 7.14 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.03 7.03 0 0 0-1.62-.94l-.36-2.54A.5.5 0 0 0 13.9 2h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.55-1.62.94l-2.39-.96a.5.5 0 0 0-.6.22L2.67 8.48a.5.5 0 0 0 .12.63l2.03 1.58c-.03.31-.05.63-.05.94s.02.63.05.94L2.79 14.15a.5.5 0 0 0-.12.63l1.92 3.32c.14.24.42.34.6.22l2.39-.96c.5.39 1.04.71 1.62.94l.36 2.54c.05.24.26.42.5.42h3.84c.24 0 .45-.18.5-.42l.36-2.54c.58-.23 1.12-.55 1.62-.94l2.39.96c.27.1.52 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 15.6 12 3.6 3.6 0 0 1 12 15.6z" />
          </svg>
          {hasApiKey ? "Settings" : "Add API key"}
        </button>
      </div>
    </header>
  );
}
