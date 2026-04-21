export type SuggestionType =
  | "question"
  | "talking_point"
  | "answer"
  | "fact_check"
  | "clarify";

export interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  preview: string;
  reasoning?: string;
}

export interface SuggestionBatch {
  batch_id: string;
  created_at: number;
  suggestions: Suggestion[];
}

export interface TranscriptChunk {
  chunk_id: string;
  start_ts: number;
  end_ts: number;
  text: string;
}

export interface ChatMessage {
  id: string;
  ts: number;
  role: "user" | "assistant";
  content: string;
  origin: "typed" | "suggestion";
  suggestion_id?: string | null;
  streaming?: boolean;
}

export interface AppSettings {
  groq_api_key: string;
  suggestion_prompt: string;
  expanded_prompt: string;
  chat_prompt: string;
  suggestions_context_window_seconds: number;
  expanded_context_window_seconds: number;
  chat_context_window_seconds: number;
  auto_refresh_seconds: number;
  chunk_seconds: number;
  suggestion_model: string;
  chat_model: string;
  transcribe_model: string;
  suggestion_temperature: number;
  chat_temperature: number;
  expanded_temperature: number;
}
