# MeetingMind

AI Meeting Intelligence for African SMBs — record, transcribe, summarise, and extract action items from business meetings, with WhatsApp delivery and Naira-native pricing.

---

## What it does

Upload a meeting recording (or connect Google Meet/Zoom) and MeetingMind will:

1. **Transcribe** the audio using [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — free, local, handles Nigerian English and code-switching
2. **Analyse** the transcript with an LLM to produce: executive summary, key decisions, action items with owners and due dates, topics discussed, and a meeting effectiveness score
3. **Notify** every participant via **WhatsApp** and email within minutes of the meeting ending

The AI prompt is tuned for Nigerian business context — Pidgin phrases, seniority structures, consensus-driven decisions.

---

## Tech Stack

| Layer | Technology |
|---|---|
| API | FastAPI + Uvicorn |
| Async tasks | Celery + Redis |
| Database | PostgreSQL 16 |
| Object storage | MinIO (S3-compatible) |
| Transcription | faster-whisper (local) or Azure Speech |
| LLM | Ollama / Llama 3.2 (local) or Anthropic Claude |
| Frontend | React 18 + Vite + Tailwind CSS |
| Notifications | Twilio WhatsApp API + SMTP |
| Billing | Paystack (Naira) |
| Proxy | Nginx |

---

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) v2+
- Git
- 8 GB RAM minimum (for running Whisper + Ollama locally)
- (Optional) NVIDIA GPU for faster transcription

---

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/JKristilere/MeetingMind.git
cd MeetingMind
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in **at minimum**:

```env
APP_SECRET_KEY=your-random-secret-here
JWT_SECRET_KEY=another-random-secret-here
```

Everything else works out of the box for local development with default values.

### 3. Run the setup script

```bash
bash scripts/setup.sh
```

This will:
- Build all Docker images
- Start PostgreSQL, Redis, and MinIO
- Run database migrations
- Pull the Ollama LLM model (~2 GB download)
- Start the full stack

### 4. Open the app

| Service | URL |
|---|---|
| Web app | http://localhost |
| API docs (Swagger) | http://localhost/docs |
| Celery task monitor | http://localhost:5555 |
| MinIO console | http://localhost:9001 |

Register an account, create a workspace in **Settings**, then upload your first meeting from **Upload**.

---

## Manual Setup (step by step)

If you prefer to run steps individually:

```bash
# 1. Copy env file
cp .env.example .env

# 2. Build images
docker compose build

# 3. Start infrastructure
docker compose up -d postgres redis minio

# 4. Run migrations
docker compose run --rm backend alembic upgrade head

# 5. Start Ollama and pull the model
docker compose up -d ollama
docker compose exec ollama ollama pull llama3.2

# 6. Start everything
docker compose up -d

# 7. Watch logs
docker compose logs -f backend worker
```

---

## Configuration

All configuration lives in `.env`. Key options:

### Transcription provider

```env
# Use local Whisper (default — free, no API key needed)
TRANSCRIPTION_PROVIDER=whisper
WHISPER_MODEL_SIZE=medium   # tiny | base | small | medium | large-v3

# Or use Azure Speech (more accurate for Nigerian accents with custom models)
TRANSCRIPTION_PROVIDER=azure
AZURE_SPEECH_KEY=your-key
AZURE_SPEECH_REGION=eastus
```

### LLM provider

```env
# Ollama — local, free (default)
LLM_PROVIDER=ollama
OLLAMA_MODEL=llama3.2

# Anthropic Claude — higher quality, ~$0.02/meeting
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-4-6

# OpenAI GPT-4
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Azure OpenAI
LLM_PROVIDER=azure_openai
AZURE_OPENAI_KEY=...
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com
AZURE_OPENAI_DEPLOYMENT=your-deployment-name
```

### WhatsApp notifications (Twilio)

```bash
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
```

To enable WhatsApp: join the [Twilio Sandbox](https://www.twilio.com/console/sms/whatsapp/sandbox), then add your WhatsApp number to your profile in the app.

### Email notifications (SMTP)

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=you@gmail.com
SMTP_PASSWORD=your-app-password   # Gmail: use an App Password
SMTP_FROM_EMAIL=noreply@yourcompany.com
```

### Paystack billing

```env
PAYSTACK_SECRET_KEY=sk_live_...
PAYSTACK_PUBLIC_KEY=pk_live_...
PAYSTACK_WEBHOOK_SECRET=your-webhook-secret
```

---

## Supported Audio/Video Formats

MP3, MP4, WAV, M4A, OGG, FLAC, WebM, MPEG — up to **500 MB** per file.

---

## Supported Languages

| Language | Code | Notes |
|---|---|---|
| Auto-detect | `auto` | Recommended — Whisper detects dominant language |
| English (Nigerian) | `en` | Handles Nigerian English and Pidgin code-switching |
| Yoruba | `yo` | |
| Igbo | `ig` | |
| Hausa | `ha` | |
| Nigerian Pidgin | `pcm` | Transcribed as English with Pidgin phrases preserved |
| French | `fr` | For Francophone Africa |
| Swahili | `sw` | |

---

## Development

### Backend (FastAPI)

```bash
cd backend

# Install dependencies (Python 3.12+)
pip install -r requirements.txt

# Run locally (requires postgres + redis running)
uvicorn app.main:app --reload --port 8000
```

### Frontend (React)

```bash
cd frontend

# Install dependencies (Node 20+)
npm install

# Start dev server with hot reload
npm run dev
# → http://localhost:5173
```

The Vite dev server proxies `/api/*` to `http://localhost:8000`.

### Database migrations

```bash
# Run all migrations
docker compose run --rm backend alembic upgrade head

# Create a new migration
docker compose run --rm backend alembic revision --autogenerate -m "your description"

# Rollback one step
docker compose run --rm backend alembic downgrade -1
```

### Celery worker (local)

```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info -Q processing,notifications
```

---

## Scaling for Production

### Scale transcription workers

```bash
# Run 4 parallel workers
docker compose up -d --scale worker=4
```

### Enable GPU for Whisper

In `docker-compose.yml`, uncomment the `deploy.resources` block under the `worker` service and set:

```env
WHISPER_DEVICE=cuda
WHISPER_COMPUTE_TYPE=float16
```

### Estimated cost at 500 meetings/month

| Item | Cost |
|---|---|
| VPS (4 vCPU / 8 GB) | ~$20/month |
| Anthropic API | ~$10/month |
| Twilio WhatsApp | ~$5/month |
| **Total** | **~$35/month** |

At ₦8,000/user/month, a single 10-person SME customer covers your entire infrastructure cost.

---

## Pricing Tiers (seeded automatically)

| Plan | Price | Users | Meetings/month |
|---|---|---|---|
| Free | ₦0 | 3 | 5 |
| Starter | ₦8,000 | 5 | 20 |
| Growth | ₦25,000 | 15 | 100 |
| Business | ₦60,000 | Unlimited | Unlimited |

---

## Stopping the stack

```bash
# Stop all services
docker compose down

# Stop and delete all data volumes
docker compose down -v
```

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram, data model, and processing pipeline.

---

## License

MIT
