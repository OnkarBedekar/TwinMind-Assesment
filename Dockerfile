FROM python:3.11-slim-bookworm

WORKDIR /app

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt

COPY backend /app/backend

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["sh", "-c", "exec uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
