import type {
  AppSettings,
  SuggestionBatch,
  TranscriptChunk,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

async function extractErrorDetail(r: Response): Promise<string> {
  const txt = await r.text().catch(() => "");
  if (!txt) return `request failed (${r.status})`;
  try {
    const data = JSON.parse(txt) as { detail?: string };
    if (typeof data.detail === "string" && data.detail.trim()) return data.detail;
  } catch {
  }
  return txt;
}

function buildHeaders(settings: AppSettings, extra: Record<string, string> = {}): HeadersInit {
  return {
    "X-Groq-Key": settings.groq_api_key ?? "",
    ...extra,
  };
}

export async function createSession(): Promise<{ session_id: string; started_at: number }> {
  const r = await fetch(`${API_BASE}/api/session`, { method: "POST" });
  if (!r.ok) throw new Error(`createSession failed: ${r.status}`);
  return r.json();
}

export async function fetchDefaults(): Promise<Omit<AppSettings, "groq_api_key">> {
  const r = await fetch(`${API_BASE}/api/settings/defaults`);
  if (!r.ok) throw new Error(`fetchDefaults failed: ${r.status}`);
  return r.json();
}

export async function uploadTranscribeChunk(
  settings: AppSettings,
  params: {
    session_id: string;
    start_ts: number;
    end_ts: number;
    blob: Blob;
    filename: string;
  },
): Promise<TranscriptChunk | null> {
  const form = new FormData();
  form.append("session_id", params.session_id);
  form.append("start_ts", String(params.start_ts));
  form.append("end_ts", String(params.end_ts));
  form.append("transcribe_model", settings.transcribe_model);
  form.append("audio", params.blob, params.filename);

  const r = await fetch(`${API_BASE}/api/transcribe`, {
    method: "POST",
    headers: buildHeaders(settings),
    body: form,
  });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`transcribe failed: ${r.status} ${txt}`);
  }
  const data = await r.json();
  if (!data.text) return null;
  return data as TranscriptChunk;
}

export async function requestSuggestions(
  settings: AppSettings,
  session_id: string,
): Promise<SuggestionBatch> {
  const r = await fetch(`${API_BASE}/api/suggestions`, {
    method: "POST",
    headers: buildHeaders(settings, { "Content-Type": "application/json" }),
    body: JSON.stringify({
      session_id,
      suggestion_prompt: settings.suggestion_prompt,
      suggestions_context_window_seconds: settings.suggestions_context_window_seconds,
      suggestion_model: settings.suggestion_model,
      suggestion_temperature: settings.suggestion_temperature,
    }),
  });
  if (!r.ok) {
    const detail = await extractErrorDetail(r);
    throw new Error(detail);
  }
  return r.json();
}

export interface ChatStreamCallbacks {
  onMeta?: (meta: { user_message_id: string; user_ts: number }) => void;
  onToken: (delta: string) => void;
  onDone: (info: { assistant_message_id: string; assistant_ts: number }) => void;
  onError: (err: string) => void;
}

export async function streamChat(
  settings: AppSettings,
  params: {
    session_id: string;
    message?: string;
    suggestion_id?: string;
  },
  cb: ChatStreamCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const body = {
    session_id: params.session_id,
    message: params.message,
    suggestion_id: params.suggestion_id,
    chat_prompt: settings.chat_prompt,
    expanded_prompt: settings.expanded_prompt,
    chat_context_window_seconds: settings.chat_context_window_seconds,
    expanded_context_window_seconds: settings.expanded_context_window_seconds,
    chat_model: settings.chat_model,
    chat_temperature: settings.chat_temperature,
    expanded_temperature: settings.expanded_temperature,
  };

  const r = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: buildHeaders(settings, { "Content-Type": "application/json" }),
    body: JSON.stringify(body),
    signal,
  });

  if (!r.ok || !r.body) {
    const detail = await extractErrorDetail(r);
    cb.onError(detail);
    return;
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = raw.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const json = line.replace(/^data:\s?/, "").trim();
      if (!json) continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === "token") cb.onToken(evt.delta as string);
        else if (evt.type === "meta") cb.onMeta?.(evt);
        else if (evt.type === "done") cb.onDone(evt);
        else if (evt.type === "error") cb.onError(evt.detail ?? "unknown error");
      } catch {
      }
    }
  }
}

export function exportUrl(session_id: string): string {
  return `${API_BASE}/api/export?session_id=${encodeURIComponent(session_id)}`;
}
