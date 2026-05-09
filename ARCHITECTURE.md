# MeetingMind — Architecture & System Design

> AI Meeting Intelligence for African SMBs

---

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                          CLIENT LAYER                                │
│                                                                      │
│   React Web App (Vite)    │    WhatsApp (Twilio)   │   Email (SMTP) │
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTPS
                    ┌──────────────▼──────────────┐
                    │      Nginx Reverse Proxy      │
                    │   (rate-limit · TLS · gzip)  │
                    └──────┬───────────────┬───────┘
                           │               │
              ┌────────────▼───┐    ┌──────▼──────────┐
              │  FastAPI (8000)│    │  React SPA (80) │
              │   + Uvicorn    │    │   (Nginx serve) │
              └────────┬───────┘    └─────────────────┘
                       │
        ┌──────────────┼────────────────┐
        │              │                │
  ┌─────▼────┐  ┌──────▼──────┐  ┌────▼────────────┐
  │ Auth API │  │ Meetings API│  │ Orgs / Users API │
  │ JWT+OAuth│  │ Upload/CRUD │  │  Plans/Billing   │
  └──────────┘  └──────┬──────┘  └─────────────────┘
                        │ enqueue task
              ┌─────────▼──────────┐
              │    Redis Broker     │
              │  (Celery + cache)   │
              └─────────┬──────────┘
                        │
         ┌──────────────┴──────────────────┐
         │                                  │
  ┌──────▼───────────┐             ┌────────▼──────────────┐
  │ Processing Queue  │             │ Notifications Queue    │
  │                   │             │                        │
  │ 1. Download audio │             │ 1. WhatsApp (Twilio)   │
  │    from MinIO     │             │    → action items      │
  │ 2. Transcribe     │             │ 2. Email (SMTP)        │
  │    (Whisper/Azure)│             │    → HTML summary      │
  │ 3. Analyse (LLM)  │             └────────────────────────┘
  │ 4. Save to DB     │
  └──────┬────────────┘
         │
┌────────▼─────────────────────────────────────────────────┐
│                      DATA LAYER                            │
│                                                            │
│  PostgreSQL 16    │    MinIO (S3)     │    Redis 7         │
│  ─────────────    │    ──────────     │    ───────         │
│  users            │    audio files   │    session cache   │
│  organisations    │    transcripts   │    rate limiting   │
│  meetings         │                  │    task results    │
│  transcripts      │                  │                    │
│  action_items     │                  │                    │
│  plans/billing    │                  │                    │
└────────────────────────────────────────────────────────────┘
```

---

## Tech Stack (100% Open Source)

| Layer             | Technology           | Why                                                |
|-------------------|---------------------|----------------------------------------------------|
| API               | FastAPI + Uvicorn   | Async, fast, great OpenAPI docs                   |
| Task Queue        | Celery + Redis      | Async audio processing; retry on failure           |
| Database          | PostgreSQL 16       | JSONB for structured AI output; full-text search  |
| Object Storage    | MinIO               | S3-compatible, self-hosted, no egress costs       |
| Transcription     | faster-whisper      | Local, free, handles Nigerian English well        |
| LLM (default)     | Ollama / Llama 3.2  | Local, zero per-call cost                         |
| LLM (cloud)       | Anthropic Claude    | Higher quality, swap via env var                  |
| Frontend          | React + Vite        | Fast, modern, small bundle                        |
| Styling           | Tailwind CSS        | Utility-first, consistent design                  |
| Proxy             | Nginx               | TLS termination, static files, load balancing     |
| Notifications     | Twilio WhatsApp API | Where Nigerian business actually happens          |
| Billing           | Paystack            | Naira-native payments, no FX pain                 |
| Monitoring        | Flower              | Celery task dashboard                              |
| Containerisation  | Docker Compose      | One-command local setup                            |

---

## Processing Pipeline

```
User uploads audio/video
        │
        ▼
[1] FastAPI receives file
    - Validate format & size
    - Upload to MinIO (async)
    - Create Meeting record (status=processing)
    - Enqueue process_meeting_task
        │
        ▼
[2] Celery Worker — Transcription
    - Download audio bytes from MinIO
    - Run faster-whisper (or Azure Speech)
    - Detect language automatically
    - Save Transcript to DB + MinIO
        │
        ▼
[3] Celery Worker — AI Analysis
    - Send transcript to LLM with prompt
    - Extract structured JSON:
        • 2-4 sentence executive summary
        • Key decisions made
        • Action items (title, owner, due date, priority)
        • Topics discussed
        • Sentiment (positive/neutral/negative)
        • Meeting effectiveness score (1-10)
    - Save results to Meeting record
        │
        ▼
[4] Celery Worker — Notifications
    - For each participant:
        • WhatsApp: action items + summary
        • Email: HTML email with full breakdown
    - Update notification timestamps
        │
        ▼
[5] Frontend polls for status
    - Auto-refreshes every 4 seconds while processing
    - Shows real-time status: Transcribing → Analysing → Complete
```

---

## African Localisation Strategy

### Language Support
- **Auto-detect** — Whisper identifies dominant language
- **Code-switching** — Nigerian meetings mix English + Pidgin + Yoruba phrases; Whisper transcribes the dominant language and preserves mixed phrases
- **Language options**: English (Nigerian), Pidgin, Yoruba, Igbo, Hausa, French, Swahili

### AI Prompt Design
The LLM system prompt is tuned for:
- Nigerian English idioms ("let's synergize", "we will take it from there")
- Pidgin phrases in context
- African business culture: consensus-building, seniority structures
- Local business contexts: trading, fintech, logistics, fashion, agri

### Pricing (Naira-native via Paystack)
| Plan     | Price/month | Users | Meetings |
|----------|-------------|-------|----------|
| Free     | ₦0          | 3     | 5        |
| Starter  | ₦8,000      | 5     | 20       |
| Growth   | ₦25,000     | 15    | 100      |
| Business | ₦60,000     | ∞     | ∞        |

### WhatsApp-first Notifications
Action items are delivered via WhatsApp because:
- 97%+ of Nigerian professionals use WhatsApp for business
- Higher open rates than email
- Enables quick acknowledgement and forwarding

---

## Data Models

```
Organisation ──< OrganisationMember >── User
     │
     └──< Meeting
               │
               ├── Transcript (1:1)
               ├──< ActionItem
               └──< MeetingParticipant
```

---

## Security

- JWT authentication (access + refresh tokens)
- Google OAuth2 optional
- Passwords hashed with bcrypt (passlib)
- All file uploads validated (type + size)
- Presigned MinIO URLs for audio access (1-hour expiry)
- CORS configured per environment
- Rate limiting via Nginx

---

## Deployment (Production)

### Recommended: VPS (DigitalOcean, AWS, or local Nigerian cloud)
```bash
# Minimum specs for 50 concurrent users
# CPU: 4 vCPU  RAM: 8 GB  Disk: 100 GB SSD

# Set LLM_PROVIDER=anthropic for better quality (small per-meeting cost ~$0.02)
# Set TRANSCRIPTION_PROVIDER=whisper for zero transcription cost
# Enable GPU for Whisper if high volume: WHISPER_DEVICE=cuda
```

### Scaling the worker
```bash
# Scale transcription workers independently
docker-compose up -d --scale worker=3
```

### Cost estimate at 500 meetings/month (Anthropic LLM)
- VPS: ~$20/month
- Anthropic API: ~$10/month ($0.02/meeting × 500)
- Twilio WhatsApp: ~$5/month
- **Total: ~$35/month → charge ₦8,000/user/month**

---

## Running Locally

```bash
git clone https://github.com/your-org/meetingmind
cd meetingmind
bash scripts/setup.sh
```

Access:
- App: http://localhost
- API docs: http://localhost/docs
- Celery monitor: http://localhost:5555
- MinIO console: http://localhost:9001
