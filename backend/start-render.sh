#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# MeetingMind — Render.com startup script
#
# Runs inside the backend Docker container on Render's free web service.
# Both the FastAPI API and the Celery worker run in the same container to stay
# within the free tier (one service = no extra cost).
#
# Memory budget (Render free = 512 MB):
#   FastAPI + uvicorn   ~120 MB
#   Celery worker       ~120 MB
#   asyncpg pool        ~20 MB
#   Overhead            ~50 MB
#   Total               ~310 MB  ← comfortably fits
#
# Note: LLM_PROVIDER=groq + TRANSCRIPTION_PROVIDER=groq means no heavy ML
# models are loaded locally — all inference is done via Groq's free API.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PORT="${PORT:-8000}"

echo "================================================================"
echo " MeetingMind — Render startup"
echo " PORT=$PORT  APP_ENV=${APP_ENV:-production}"
echo "================================================================"

# ── 1. Database migrations ────────────────────────────────────────────────────
echo ""
echo "▶ Running Alembic migrations..."
alembic upgrade head
echo "✔ Migrations complete"

# ── 2. Celery worker (background) ────────────────────────────────────────────
echo ""
echo "▶ Starting Celery worker (background)..."
celery -A app.workers.celery_app worker \
  --loglevel=info \
  --queues=processing,notifications \
  --concurrency=1 \
  --max-tasks-per-child=10 \
  --without-heartbeat \
  --without-gossip \
  --without-mingle \
  &
WORKER_PID=$!
echo "✔ Celery worker started (PID=$WORKER_PID)"

# ── 3. FastAPI ────────────────────────────────────────────────────────────────
echo ""
echo "▶ Starting FastAPI on port $PORT..."
exec uvicorn app.main:app \
  --host 0.0.0.0 \
  --port "$PORT" \
  --workers 1 \
  --timeout-keep-alive 75 \
  --log-level info
