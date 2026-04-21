import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  ChatMessage,
  Suggestion,
  SuggestionBatch,
  TranscriptChunk,
} from "../lib/types";
import { createSession, fetchDefaults } from "../lib/api";

const SETTINGS_KEY = "twinmind.settings.v1";

const FALLBACK_DEFAULTS: Omit<AppSettings, "groq_api_key"> = {
  suggestion_prompt: "",
  expanded_prompt: "",
  chat_prompt: "",
  suggestions_context_window_seconds: 180,
  expanded_context_window_seconds: 0,
  chat_context_window_seconds: 0,
  auto_refresh_seconds: 30,
  chunk_seconds: 30,
  suggestion_model: "openai/gpt-oss-120b",
  chat_model: "openai/gpt-oss-120b",
  transcribe_model: "whisper-large-v3",
  suggestion_temperature: 0.4,
  chat_temperature: 0.3,
  expanded_temperature: 0.3,
};

interface SessionContextValue {
  sessionId: string | null;
  startedAt: number | null;
  transcript: TranscriptChunk[];
  batches: SuggestionBatch[];
  chat: ChatMessage[];
  settings: AppSettings;
  defaults: Omit<AppSettings, "groq_api_key">;
  settingsReady: boolean;
  lastError: string | null;
  updateSettings: (patch: Partial<AppSettings>) => void;
  resetSettingsToDefaults: () => void;
  addTranscriptChunk: (c: TranscriptChunk) => void;
  addBatch: (b: SuggestionBatch) => void;
  findSuggestion: (id: string) => Suggestion | undefined;
  appendChatUser: (content: string, origin: "typed" | "suggestion", suggestion_id?: string) => string;
  startChatAssistant: () => string;
  appendChatAssistantToken: (id: string, delta: string) => void;
  finishChatAssistant: (id: string) => void;
  replaceChatMessageId: (oldId: string, newId: string) => void;
  setError: (msg: string | null) => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function loadSettingsFromStorage(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<AppSettings>;
  } catch {
    return {};
  }
}

function saveSettingsToStorage(s: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [transcript, setTranscript] = useState<TranscriptChunk[]>([]);
  const [batches, setBatches] = useState<SuggestionBatch[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [defaults, setDefaults] = useState<Omit<AppSettings, "groq_api_key">>(
    FALLBACK_DEFAULTS,
  );
  const [settingsReady, setSettingsReady] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const stored = loadSettingsFromStorage();
  const [settings, setSettings] = useState<AppSettings>(() => ({
    ...FALLBACK_DEFAULTS,
    groq_api_key: "",
    ...stored,
  }));

  useEffect(() => {
    saveSettingsToStorage(settings);
  }, [settings]);

  useEffect(() => {
    let cancelled = false;
    fetchDefaults()
      .then((d) => {
        if (cancelled) return;
        setDefaults(d);
        setSettings((cur) => {
          const filled: AppSettings = { ...cur };
          for (const [k, v] of Object.entries(d)) {
            const key = k as keyof typeof d;
            const cv = (cur as any)[key];
            if (cv === undefined || cv === null || cv === "") {
              (filled as any)[key] = v;
            }
          }
          return filled;
        });
        setSettingsReady(true);
      })
      .catch(() => {
        if (!cancelled) setSettingsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const didInit = useRef(false);
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    createSession()
      .then((s) => {
        setSessionId(s.session_id);
        setStartedAt(s.started_at);
      })
      .catch((e) => setLastError(`Backend unreachable: ${String(e)}`));
  }, []);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((cur) => ({ ...cur, ...patch }));
  }, []);

  const resetSettingsToDefaults = useCallback(() => {
    setSettings((cur) => ({
      ...cur,
      ...defaults,
    }));
  }, [defaults]);

  const addTranscriptChunk = useCallback((c: TranscriptChunk) => {
    setTranscript((cur) => [...cur, c]);
  }, []);

  const addBatch = useCallback((b: SuggestionBatch) => {
    setBatches((cur) => [...cur, b]);
  }, []);

  const findSuggestion = useCallback(
    (id: string) => {
      for (const b of batches) {
        const s = b.suggestions.find((x) => x.id === id);
        if (s) return s;
      }
      return undefined;
    },
    [batches],
  );

  const appendChatUser = useCallback(
    (content: string, origin: "typed" | "suggestion", suggestion_id?: string) => {
      const id = `local-${Math.random().toString(36).slice(2)}`;
      const msg: ChatMessage = {
        id,
        ts: Date.now() / 1000,
        role: "user",
        content,
        origin,
        suggestion_id: suggestion_id ?? null,
      };
      setChat((cur) => [...cur, msg]);
      return id;
    },
    [],
  );

  const startChatAssistant = useCallback(() => {
    const id = `local-${Math.random().toString(36).slice(2)}`;
    const msg: ChatMessage = {
      id,
      ts: Date.now() / 1000,
      role: "assistant",
      content: "",
      origin: "typed",
      streaming: true,
    };
    setChat((cur) => [...cur, msg]);
    return id;
  }, []);

  const appendChatAssistantToken = useCallback((id: string, delta: string) => {
    setChat((cur) =>
      cur.map((m) => (m.id === id ? { ...m, content: m.content + delta } : m)),
    );
  }, []);

  const finishChatAssistant = useCallback((id: string) => {
    setChat((cur) =>
      cur.map((m) => (m.id === id ? { ...m, streaming: false } : m)),
    );
  }, []);

  const replaceChatMessageId = useCallback((oldId: string, newId: string) => {
    setChat((cur) => cur.map((m) => (m.id === oldId ? { ...m, id: newId } : m)));
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      sessionId,
      startedAt,
      transcript,
      batches,
      chat,
      settings,
      defaults,
      settingsReady,
      lastError,
      updateSettings,
      resetSettingsToDefaults,
      addTranscriptChunk,
      addBatch,
      findSuggestion,
      appendChatUser,
      startChatAssistant,
      appendChatAssistantToken,
      finishChatAssistant,
      replaceChatMessageId,
      setError: setLastError,
    }),
    [
      sessionId,
      startedAt,
      transcript,
      batches,
      chat,
      settings,
      defaults,
      settingsReady,
      lastError,
      updateSettings,
      resetSettingsToDefaults,
      addTranscriptChunk,
      addBatch,
      findSuggestion,
      appendChatUser,
      startChatAssistant,
      appendChatAssistantToken,
      finishChatAssistant,
      replaceChatMessageId,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}
