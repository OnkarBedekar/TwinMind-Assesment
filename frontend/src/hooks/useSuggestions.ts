import { useCallback, useEffect, useRef, useState } from "react";
import { requestSuggestions } from "../lib/api";
import { useSession } from "../state/SessionContext";

export function useSuggestions(opts: {
  isRecording: boolean;
  flushChunk?: () => Promise<void>;
}) {
  const { sessionId, settings, addBatch, setError } = useSession();
  const [loading, setLoading] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);

  const latestRef = useRef({ sessionId, settings });
  useEffect(() => {
    latestRef.current = { sessionId, settings };
  }, [sessionId, settings]);

  const refresh = useCallback(
    async (opts_?: { flush?: boolean }) => {
      const { sessionId: sid, settings: s } = latestRef.current;
      if (!sid) return;
      if (!s.groq_api_key) {
        setError("Add your Groq API key in Settings to get suggestions.");
        return;
      }
      setLoading(true);
      try {
        if (opts_?.flush && opts.flushChunk) {
          try {
            await opts.flushChunk();
          } catch {
          }
        }
        const batch = await requestSuggestions(s, sid);
        addBatch(batch);
        setLastRefreshAt(Date.now());
        setError(null);
      } catch (e: any) {
        setError(`Suggestions failed: ${e?.message ?? String(e)}`);
      } finally {
        setLoading(false);
      }
    },
    [addBatch, setError, opts.flushChunk],
  );

  useEffect(() => {
    if (!opts.isRecording) return;
    const ms = Math.max(5_000, settings.auto_refresh_seconds * 1000);
    const id = window.setInterval(() => {
      refresh();
    }, ms);
    return () => window.clearInterval(id);
  }, [opts.isRecording, settings.auto_refresh_seconds, refresh]);

  return { refresh, loading, lastRefreshAt };
}
