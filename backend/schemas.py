from __future__ import annotations

from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class SessionCreateResponse(BaseModel):
    session_id: str
    started_at: float


class TranscribeResponse(BaseModel):
    chunk_id: str
    text: str
    start_ts: float
    end_ts: float


class SuggestionsRequest(BaseModel):
    session_id: str
    suggestion_prompt: Optional[str] = None
    suggestions_context_window_seconds: Optional[int] = None
    suggestion_model: Optional[str] = None
    suggestion_temperature: Optional[float] = None


class Suggestion(BaseModel):
    id: str
    type: Literal["question", "talking_point", "answer", "fact_check", "clarify"]
    title: str
    preview: str
    reasoning: str = ""


class SuggestionBatch(BaseModel):
    batch_id: str
    created_at: float
    suggestions: List[Suggestion]


class ChatRequest(BaseModel):
    session_id: str
    message: Optional[str] = None
    suggestion_id: Optional[str] = None
    chat_prompt: Optional[str] = None
    expanded_prompt: Optional[str] = None
    chat_context_window_seconds: Optional[int] = None
    expanded_context_window_seconds: Optional[int] = None
    chat_model: Optional[str] = None
    chat_temperature: Optional[float] = None
    expanded_temperature: Optional[float] = None


class ChatMessage(BaseModel):
    id: str
    ts: float
    role: Literal["user", "assistant"]
    content: str
    origin: Literal["typed", "suggestion"] = "typed"
    suggestion_id: Optional[str] = None


class TranscriptChunk(BaseModel):
    chunk_id: str
    start_ts: float
    end_ts: float
    text: str


class ExportResponse(BaseModel):
    session_id: str
    started_at: float
    exported_at: float
    transcript: List[TranscriptChunk]
    batches: List[SuggestionBatch]
    chat: List[ChatMessage]


class SettingsDefaultsResponse(BaseModel):
    suggestion_prompt: str
    expanded_prompt: str
    chat_prompt: str
    suggestions_context_window_seconds: int
    expanded_context_window_seconds: int
    chat_context_window_seconds: int
    auto_refresh_seconds: int
    chunk_seconds: int
    suggestion_model: str
    chat_model: str
    transcribe_model: str
    suggestion_temperature: float = Field(default=0.4)
    chat_temperature: float = Field(default=0.3)
    expanded_temperature: float = Field(default=0.3)
