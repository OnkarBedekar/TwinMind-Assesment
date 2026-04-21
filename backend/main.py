from __future__ import annotations

import json
import logging
import time
import uuid
from typing import List, Dict, Any, Optional, cast, Literal

from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from . import groq_client, prompts, schemas
from .session_store import Suggestion, store

_SuggestionType = Literal["question", "talking_point", "answer", "fact_check", "clarify"]

logger = logging.getLogger("twinmind")
logging.basicConfig(level=logging.INFO)

app = FastAPI(title="TwinMind Live Suggestions", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


def _require_key(key: Optional[str]) -> str:
    if not key or not key.strip():
        raise HTTPException(
            status_code=401,
            detail="Missing Groq API key. Paste it in Settings.",
        )
    return key.strip()


def _safe_json_loads(raw: str) -> Dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end = raw.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except json.JSONDecodeError:
                pass
        raise HTTPException(status_code=502, detail="Model returned invalid JSON")


def _raise_model_permission_if_blocked(err: Exception, model: str) -> None:
    msg = str(err)
    if (
        "model_permission_blocked_org" in msg
        or "permissions_error" in msg
        or "blocked at the organization level" in msg
    ):
        raise HTTPException(
            status_code=403,
            detail=(
                f"Model `{model}` is blocked for this Groq organization. "
                "Enable it at https://console.groq.com/settings/limits and retry."
            ),
        )


@app.get("/api/health")
def health() -> Dict[str, Any]:
    return {"ok": True, "ts": time.time()}


@app.get("/api/settings/defaults", response_model=schemas.SettingsDefaultsResponse)
def settings_defaults() -> schemas.SettingsDefaultsResponse:
    return schemas.SettingsDefaultsResponse(**prompts.DEFAULT_SETTINGS)


@app.post("/api/session", response_model=schemas.SessionCreateResponse)
def create_session() -> schemas.SessionCreateResponse:
    state = store.create()
    return schemas.SessionCreateResponse(
        session_id=state.session_id, started_at=state.started_at
    )


@app.post("/api/transcribe", response_model=schemas.TranscribeResponse)
async def transcribe(
    session_id: str = Form(...),
    start_ts: float = Form(...),
    end_ts: float = Form(...),
    audio: UploadFile = File(...),
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
    transcribe_model: Optional[str] = Form(default=None),
) -> schemas.TranscribeResponse:
    key = _require_key(x_groq_key)
    data = await audio.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty audio chunk")

    model = transcribe_model or prompts.DEFAULT_SETTINGS["transcribe_model"]
    filename = audio.filename or "chunk.webm"

    try:
        text = groq_client.transcribe_audio(
            api_key=key, audio_bytes=data, filename=filename, model=model
        )
    except Exception as e:
        logger.exception("Whisper transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")

    if not text:
        return schemas.TranscribeResponse(
            chunk_id="",
            text="",
            start_ts=start_ts,
            end_ts=end_ts,
        )

    chunk = store.append_transcript(session_id, text, start_ts, end_ts)
    return schemas.TranscribeResponse(
        chunk_id=chunk.chunk_id,
        text=chunk.text,
        start_ts=chunk.start_ts,
        end_ts=chunk.end_ts,
    )


@app.post("/api/suggestions", response_model=schemas.SuggestionBatch)
def suggestions(
    req: schemas.SuggestionsRequest,
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
) -> schemas.SuggestionBatch:
    key = _require_key(x_groq_key)

    window = (
        req.suggestions_context_window_seconds
        if req.suggestions_context_window_seconds is not None
        else prompts.DEFAULT_SETTINGS["suggestions_context_window_seconds"]
    )
    system_prompt = req.suggestion_prompt or prompts.DEFAULT_SETTINGS["suggestion_prompt"]
    model = req.suggestion_model or prompts.DEFAULT_SETTINGS["suggestion_model"]
    temperature = (
        req.suggestion_temperature
        if req.suggestion_temperature is not None
        else prompts.DEFAULT_SETTINGS["suggestion_temperature"]
    )

    transcript_text = store.get_transcript_window(req.session_id, window)
    previous = store.previous_batch_summary(req.session_id)

    if not transcript_text.strip():
        transcript_text = "(no transcript yet - the meeting just started)"

    user_payload = (
        "RECENT_TRANSCRIPT:\n"
        f"{transcript_text}\n\n"
        "PREVIOUS_BATCH (avoid repeating or lightly rewording these):\n"
        f"{previous or '(none)'}"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_payload},
    ]

    try:
        raw = groq_client.suggestions_json(
            api_key=key, messages=messages, model=model, temperature=temperature
        )
    except Exception as e:
        logger.exception("Suggestions call failed")
        _raise_model_permission_if_blocked(e, model)
        raise HTTPException(status_code=502, detail=f"Suggestions failed: {e}")

    parsed = _safe_json_loads(raw)
    items = parsed.get("suggestions") or parsed.get("batch") or []
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=502, detail="Model did not return suggestions")

    valid_types = {"question", "talking_point", "answer", "fact_check", "clarify"}
    suggestion_objs: List[Suggestion] = []
    for raw_s in items[:3]:
        if not isinstance(raw_s, dict):
            continue
        stype = str(raw_s.get("type", "clarify")).lower().strip()
        if stype not in valid_types:
            stype = "clarify"
        suggestion_objs.append(
            Suggestion(
                id=uuid.uuid4().hex,
                type=stype,
                title=str(raw_s.get("title", ""))[:80].strip() or "Suggestion",
                preview=str(raw_s.get("preview", "")).strip(),
                reasoning=str(raw_s.get("reasoning", "")).strip(),
            )
        )

    while len(suggestion_objs) < 3:
        suggestion_objs.append(
            Suggestion(
                id=uuid.uuid4().hex,
                type="clarify",
                title="No signal yet",
                preview="Waiting for more conversation to make a useful suggestion.",
                reasoning="Fallback when model returned fewer than 3 items.",
            )
        )

    batch = store.append_batch(req.session_id, suggestion_objs)
    return schemas.SuggestionBatch(
        batch_id=batch.batch_id,
        created_at=batch.created_at,
        suggestions=[
            schemas.Suggestion(
                id=s.id,
                type=cast(_SuggestionType, s.type),
                title=s.title,
                preview=s.preview,
                reasoning=s.reasoning,
            )
            for s in batch.suggestions
        ],
    )


def _build_chat_messages(
    req: schemas.ChatRequest,
) -> tuple[List[Dict[str, str]], str, str, Optional[str], float, str]:
    if req.suggestion_id:
        sug = store.find_suggestion(req.session_id, req.suggestion_id)
        if sug is None:
            raise HTTPException(status_code=404, detail="Suggestion not found")

        window = (
            req.expanded_context_window_seconds
            if req.expanded_context_window_seconds is not None
            else prompts.DEFAULT_SETTINGS["expanded_context_window_seconds"]
        )
        transcript_text = store.get_transcript_window(req.session_id, window) or "(empty)"
        system_prompt = req.expanded_prompt or prompts.DEFAULT_SETTINGS["expanded_prompt"]
        temperature = (
            req.expanded_temperature
            if req.expanded_temperature is not None
            else prompts.DEFAULT_SETTINGS["expanded_temperature"]
        )

        user_content = (
            f"SUGGESTION:\n"
            f"- type: {sug.type}\n"
            f"- title: {sug.title}\n"
            f"- preview: {sug.preview}\n"
            f"- reasoning: {sug.reasoning}\n\n"
            f"TRANSCRIPT:\n{transcript_text}"
        )

        history_content = f"[{sug.type}] {sug.title} - {sug.preview}"
        model = req.chat_model or prompts.DEFAULT_SETTINGS["chat_model"]
        return (
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            history_content,
            "suggestion",
            req.suggestion_id,
            temperature,
            model,
        )

    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="Empty message")

    window = (
        req.chat_context_window_seconds
        if req.chat_context_window_seconds is not None
        else prompts.DEFAULT_SETTINGS["chat_context_window_seconds"]
    )
    transcript_text = store.get_transcript_window(req.session_id, window) or "(empty)"
    system_prompt = req.chat_prompt or prompts.DEFAULT_SETTINGS["chat_prompt"]
    temperature = (
        req.chat_temperature
        if req.chat_temperature is not None
        else prompts.DEFAULT_SETTINGS["chat_temperature"]
    )
    model = req.chat_model or prompts.DEFAULT_SETTINGS["chat_model"]

    state = store.get_or_create(req.session_id)
    with state.lock:
        prior = list(state.chat)

    messages: List[Dict[str, str]] = [
        {
            "role": "system",
            "content": (
                f"{system_prompt}\n\nMEETING TRANSCRIPT SO FAR:\n{transcript_text}"
            ),
        }
    ]
    for m in prior[-10:]:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": req.message.strip()})

    return messages, req.message.strip(), "typed", None, temperature, model


@app.post("/api/chat")
def chat(
    req: schemas.ChatRequest,
    x_groq_key: Optional[str] = Header(default=None, alias="X-Groq-Key"),
) -> StreamingResponse:
    key = _require_key(x_groq_key)

    messages, history_user_text, origin, suggestion_id, temperature, model = (
        _build_chat_messages(req)
    )

    user_msg = store.append_chat(
        req.session_id,
        role="user",
        content=history_user_text,
        origin=origin,
        suggestion_id=suggestion_id,
    )

    def event_stream():
        assistant_buf: List[str] = []
        try:
            meta = {
                "type": "meta",
                "user_message_id": user_msg.id,
                "user_ts": user_msg.ts,
            }
            yield f"data: {json.dumps(meta)}\n\n"

            for piece in groq_client.chat_stream(
                api_key=key, messages=messages, model=model, temperature=temperature
            ):
                assistant_buf.append(piece)
                payload = json.dumps({"type": "token", "delta": piece})
                yield f"data: {payload}\n\n"

            final = "".join(assistant_buf).strip()
            saved = store.append_chat(
                req.session_id,
                role="assistant",
                content=final,
                origin=origin,
                suggestion_id=suggestion_id,
            )
            done = json.dumps(
                {
                    "type": "done",
                    "assistant_message_id": saved.id,
                    "assistant_ts": saved.ts,
                }
            )
            yield f"data: {done}\n\n"
        except Exception as e:
            logger.exception("Chat streaming failed")
            detail = str(e)
            if (
                "model_permission_blocked_org" in detail
                or "permissions_error" in detail
                or "blocked at the organization level" in detail
            ):
                detail = (
                    f"Model `{model}` is blocked for this Groq organization. "
                    "Enable it at https://console.groq.com/settings/limits and retry."
                )
            err = json.dumps({"type": "error", "detail": detail})
            yield f"data: {err}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


@app.get("/api/export")
def export(session_id: str) -> JSONResponse:
    state = store.get(session_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session not found")

    with state.lock:
        payload = {
            "session_id": state.session_id,
            "started_at": state.started_at,
            "exported_at": time.time(),
            "transcript": [
                {
                    "chunk_id": c.chunk_id,
                    "start_ts": c.start_ts,
                    "end_ts": c.end_ts,
                    "text": c.text,
                }
                for c in state.transcript
            ],
            "batches": [
                {
                    "batch_id": b.batch_id,
                    "created_at": b.created_at,
                    "suggestions": [
                        {
                            "id": s.id,
                            "type": s.type,
                            "title": s.title,
                            "preview": s.preview,
                            "reasoning": s.reasoning,
                        }
                        for s in b.suggestions
                    ],
                }
                for b in state.batches
            ],
            "chat": [
                {
                    "id": m.id,
                    "ts": m.ts,
                    "role": m.role,
                    "content": m.content,
                    "origin": m.origin,
                    "suggestion_id": m.suggestion_id,
                }
                for m in state.chat
            ],
        }

    return JSONResponse(payload)
