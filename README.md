# TwinMind — Live Suggestions

A small meeting copilot: record from the mic, get rolling transcript chunks, three live AI suggestion cards, and a chat panel. Models run on **Groq** (Whisper for speech, a large chat model for text). You paste your own Groq API key in the app — it stays in the browser and is sent to the backend on each request.

**Stack:** FastAPI (Python) · React, TypeScript, Vite, Tailwind

## What you need

- **Python** 3.11+
- **Node** 18+
- A [Groq](https://console.groq.com/) API key (`gsk_…`)

## Quick start

From the repository root:

```bash
chmod +x run.sh   # once, if needed
./run.sh
```

`run.sh` will:

1. Create `.venv` and install `backend/requirements.txt`
2. Start the API at **http://127.0.0.1:8000** (with `--reload`)
3. Run `npm install` in `frontend` and start the Vite dev server (default **http://127.0.0.1:5173**)

## Run without `run.sh`

Terminal 1 — backend:

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.main:app --reload --port 8000
```

Terminal 2 — frontend:

```bash
cd frontend
npm install
npm run dev
```

## Prompt strategy

- **Live suggestions** use a sliding **recent transcript window** (default last **180 seconds** of chunks). That is wider than a single 30s chunk so the model sees enough context to pick questions vs answers vs fact-checks, while still weighting the latest part of the meeting.
- Each refresh also receives **PREVIOUS_BATCH**: titles and previews of the last three cards. The prompt tells the model not to repeat or lightly reword those so each refresh pushes the conversation forward instead of looping.
- Suggestions are **forced JSON** (`{"suggestions": [...]}`) with exactly **three** items. Each item has a **type** (`question`, `talking_point`, `answer`, `fact_check`, `clarify`) so the model must vary the mix based on what just happened (e.g. favor `answer` when a question was just asked).
- The **preview** is instructed to carry real value on its own (no vague teasers); the title stays short so the card scans quickly in a live meeting.
- **Expanded answer (card click)** uses the dedicated expanded system prompt plus **full transcript** by default (context window `0` = no time cutoff). The tapped card’s type steers the shape of the reply (quoted question, bullets for talking point, etc.).
- **Typed chat** uses the chat system prompt and the last **10** chat turns on the server, with transcript context (full transcript when window is `0`). Streaming responses keep time-to-first-token low.

Defaults and prompt text live in [`backend/prompts.py`](backend/prompts.py); the UI **Settings** loads the same defaults from the API and lets you edit prompts and numbers without redeploying.

## Tradeoffs

- **Latency vs context:** A longer suggestion context window improves grounding but increases tokens and latency on every refresh. 180s was chosen as a balance for “what just happened” without sending the entire meeting every 30s.
- **Transcript vs suggestion timers:** Audio is chunked on a **chunk** interval (default 30s) while suggestions refresh on **auto_refresh** (default 30s). They are separate timers so recording stays simple; manual **Refresh** flushes the current audio chunk first so the latest speech is transcribed before new suggestions run.
- **In-memory sessions:** The server keeps one session per browser load. No database — fast to build and fine for the assignment, but a restart loses server-side state (the export JSON is the durable artifact for grading).
- **Streaming chat:** Assistant replies stream over SSE so the UI shows tokens as they arrive; tradeoff is slightly more client parsing logic versus a single blocking JSON response.
- **Fixed assignment models:** Whisper Large V3 and GPT-OSS 120B are the defaults everywhere so behavior is comparable across submissions; temperatures stay editable for small quality tweaks without changing models.

## Customize behavior

Default prompts and knobs live in [`backend/prompts.py`](backend/prompts.py). The app loads defaults from `/api/settings/defaults` and you can override them in **Settings** in the UI (prompts, context windows, auto-refresh, audio chunk length, temperatures).
