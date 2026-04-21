#!/usr/bin/env bash
cd "$(dirname "$0")"
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
.venv/bin/uvicorn backend.main:app --reload --port 8000 &
cd frontend
npm install
npm run dev
