from __future__ import annotations

import io
import threading
from typing import Iterable, List, Dict, Any

from groq import Groq

_GROQ_SDK_LOCK = threading.Lock()


def _client(api_key: str) -> Groq:
    if not api_key:
        raise ValueError("Missing Groq API key")
    return Groq(api_key=api_key)


def transcribe_audio(
    api_key: str,
    audio_bytes: bytes,
    filename: str = "chunk.webm",
    model: str = "whisper-large-v3",
) -> str:
    with _GROQ_SDK_LOCK:
        client = _client(api_key)
        buf = io.BytesIO(audio_bytes)
        buf.name = filename
        resp = client.audio.transcriptions.create(
            file=(filename, buf.getvalue()),
            model=model,
            response_format="json",
            temperature=0.0,
        )
    text = getattr(resp, "text", None)
    if text is None and isinstance(resp, dict):
        text = resp.get("text", "")
    return (text or "").strip()


def suggestions_json(
    api_key: str,
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-oss-120b",
    temperature: float = 0.4,
) -> str:
    with _GROQ_SDK_LOCK:
        client = _client(api_key)
        resp = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            response_format={"type": "json_object"},
            max_tokens=900,
        )
    return resp.choices[0].message.content or "{}"


def chat_stream(
    api_key: str,
    messages: List[Dict[str, str]],
    model: str = "openai/gpt-oss-120b",
    temperature: float = 0.3,
    max_tokens: int = 800,
) -> Iterable[str]:
    with _GROQ_SDK_LOCK:
        client = _client(api_key)
        stream = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            stream=True,
        )
    for chunk in stream:
        try:
            delta = chunk.choices[0].delta
            piece = getattr(delta, "content", None)
        except (IndexError, AttributeError):
            piece = None
        if piece:
            yield piece
