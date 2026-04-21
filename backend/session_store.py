from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class TranscriptChunk:
    chunk_id: str
    start_ts: float
    end_ts: float
    text: str


@dataclass
class Suggestion:
    id: str
    type: str
    title: str
    preview: str
    reasoning: str = ""


@dataclass
class SuggestionBatch:
    batch_id: str
    created_at: float
    suggestions: List[Suggestion]


@dataclass
class ChatMessage:
    id: str
    ts: float
    role: str
    content: str
    origin: str = "typed"
    suggestion_id: Optional[str] = None


@dataclass
class SessionState:
    session_id: str
    started_at: float
    transcript: List[TranscriptChunk] = field(default_factory=list)
    batches: List[SuggestionBatch] = field(default_factory=list)
    chat: List[ChatMessage] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)


class SessionStore:
    def __init__(self) -> None:
        self._sessions: Dict[str, SessionState] = {}
        self._lock = threading.Lock()

    def create(self) -> SessionState:
        sid = uuid.uuid4().hex
        state = SessionState(session_id=sid, started_at=time.time())
        with self._lock:
            self._sessions[sid] = state
        return state

    def get(self, session_id: str) -> Optional[SessionState]:
        with self._lock:
            return self._sessions.get(session_id)

    def get_or_create(self, session_id: str) -> SessionState:
        with self._lock:
            state = self._sessions.get(session_id)
            if state is None:
                state = SessionState(session_id=session_id, started_at=time.time())
                self._sessions[session_id] = state
            return state

    def append_transcript(
        self, session_id: str, text: str, start_ts: float, end_ts: float
    ) -> TranscriptChunk:
        state = self.get_or_create(session_id)
        chunk = TranscriptChunk(
            chunk_id=uuid.uuid4().hex,
            start_ts=start_ts,
            end_ts=end_ts,
            text=text.strip(),
        )
        with state.lock:
            state.transcript.append(chunk)
        return chunk

    def append_batch(
        self, session_id: str, suggestions: List[Suggestion]
    ) -> SuggestionBatch:
        state = self.get_or_create(session_id)
        batch = SuggestionBatch(
            batch_id=uuid.uuid4().hex,
            created_at=time.time(),
            suggestions=suggestions,
        )
        with state.lock:
            state.batches.append(batch)
        return batch

    def append_chat(
        self,
        session_id: str,
        role: str,
        content: str,
        origin: str = "typed",
        suggestion_id: Optional[str] = None,
    ) -> ChatMessage:
        state = self.get_or_create(session_id)
        msg = ChatMessage(
            id=uuid.uuid4().hex,
            ts=time.time(),
            role=role,
            content=content,
            origin=origin,
            suggestion_id=suggestion_id,
        )
        with state.lock:
            state.chat.append(msg)
        return msg

    def find_suggestion(
        self, session_id: str, suggestion_id: str
    ) -> Optional[Suggestion]:
        state = self.get(session_id)
        if state is None:
            return None
        with state.lock:
            for batch in state.batches:
                for s in batch.suggestions:
                    if s.id == suggestion_id:
                        return s
        return None

    def get_transcript_window(self, session_id: str, seconds: int) -> str:
        state = self.get(session_id)
        if state is None:
            return ""
        with state.lock:
            chunks = list(state.transcript)
        if not chunks:
            return ""
        if seconds and seconds > 0:
            cutoff = time.time() - seconds
            chunks = [c for c in chunks if c.end_ts >= cutoff]
        lines = []
        for c in chunks:
            rel = max(0.0, c.start_ts - state.started_at)
            mm = int(rel // 60)
            ss = int(rel % 60)
            lines.append(f"[{mm:02d}:{ss:02d}] {c.text}")
        return "\n".join(lines)

    def previous_batch_summary(self, session_id: str) -> str:
        state = self.get(session_id)
        if state is None:
            return ""
        with state.lock:
            if not state.batches:
                return ""
            last = state.batches[-1]
        lines = []
        for s in last.suggestions:
            lines.append(f"- [{s.type}] {s.title}: {s.preview}")
        return "\n".join(lines)


store = SessionStore()
