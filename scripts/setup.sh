#!/usr/bin/env bash
set -euo pipefail

# MeetingMind — Local development setup script

echo "🎙️  MeetingMind Setup"
echo "─────────────────────────────────────────────"

# Check dependencies
for cmd in docker docker-compose git; do
    if ! command -v "$cmd" &>/dev/null; then
        echo "❌  $cmd is required but not installed."
        exit 1
    fi
done

echo "✅  Dependencies found"

# Copy env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅  Created .env from .env.example — edit it to add your API keys"
else
    echo "ℹ️   .env already exists, skipping"
fi

# Build and start services
echo ""
echo "🐳  Building Docker images…"
docker-compose build

echo ""
echo "🚀  Starting services…"
docker-compose up -d postgres redis minio

echo ""
echo "⏳  Waiting for database to be ready…"
sleep 5

echo ""
echo "📦  Running database migrations…"
docker-compose run --rm backend alembic upgrade head

echo ""
echo "🦙  Pulling Ollama model (llama3.2 ~2GB)…"
docker-compose up -d ollama
sleep 3
docker-compose exec ollama ollama pull llama3.2 || echo "ℹ️  Could not pull Ollama model — set LLM_PROVIDER=anthropic in .env"

echo ""
echo "🎉  Starting full stack…"
docker-compose up -d

echo ""
echo "─────────────────────────────────────────────"
echo "MeetingMind is running!"
echo ""
echo "  🌐  Web app:          http://localhost"
echo "  📖  API docs:         http://localhost/docs"
echo "  🌸  Celery monitor:   http://localhost:5555"
echo "  🗄️   MinIO console:    http://localhost:9001"
echo ""
echo "To stop:  docker-compose down"
echo "Logs:     docker-compose logs -f backend worker"
