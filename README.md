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

## Customize behavior

Default prompts and knobs (context windows, models, temperatures) live in [`backend/prompts.py`](backend/prompts.py). The app loads defaults from `/api/settings/defaults` and you can override most of that in **Settings** in the UI.
