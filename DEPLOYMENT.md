# MeetingMind — Free Cloud Deployment Guide

Deploy the full stack for **£0/month** using free tiers of six platforms.
Perfect for portfolios, demos, and early SMB customers.

---

## Free Stack at a Glance

| Component        | Platform           | Free Tier                        |
|------------------|--------------------|----------------------------------|
| Frontend (React) | **Vercel**         | Unlimited deploys, CDN, SSL      |
| Backend (FastAPI)| **Render**         | 750 hrs/month, auto-sleep        |
| Celery Worker    | **Render**         | 750 hrs/month background worker  |
| PostgreSQL       | **Neon**           | 0.5 GB, serverless, always-on    |
| Redis            | **Upstash**        | 10,000 req/day, serverless       |
| File Storage     | **Cloudflare R2**  | 10 GB storage, 1M req/month      |
| LLM + Whisper    | **Groq**           | Free API, Llama 3.3-70B + Whisper|

**Total cost: $0/month** for portfolio / demo traffic.

### Limitations of free tiers (acceptable for a portfolio)
- Render web services **sleep after 15 min** of inactivity → ~30 s cold start on first request
- Upstash Redis → 10,000 commands/day (~100 meetings/day) — more than enough for demos
- Neon → 0.5 GB storage — holds thousands of meetings
- Groq → generous free rate limits (check console.groq.com for current limits)

---

## Prerequisites

- GitHub account (repo already pushed ✅)
- Node.js 20+ installed locally (for the Vercel CLI)
- Python 3.12+ installed locally

---

## Step 1 — Sign Up for All Platforms (10 min)

Open each link in a new tab and create a **free** account:

| # | Platform | Link | What to do |
|---|----------|------|-----------|
| 1 | **Neon** | https://neon.tech | Sign up → Create project → name it `meetingmind` |
| 2 | **Upstash** | https://upstash.com | Sign up → Create Redis database → name it `meetingmind` |
| 3 | **Cloudflare** | https://cloudflare.com | Sign up → go to R2 in the left sidebar |
| 4 | **Groq** | https://console.groq.com | Sign up → API Keys → Create API key |
| 5 | **Render** | https://render.com | Sign up with GitHub |
| 6 | **Vercel** | https://vercel.com | Sign up with GitHub |

---

## Step 2 — Set Up Neon PostgreSQL (5 min)

1. In Neon dashboard → your project → **Connection Details**
2. Copy the **Connection string** — it looks like:
   ```
   postgresql://neondb_owner:abc123@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
3. **Save this** — you'll need it in Step 6.

> Neon is serverless PostgreSQL — it scales to zero when idle, so it won't use up resources.

---

## Step 3 — Set Up Upstash Redis (3 min)

1. In Upstash console → **Create Database**
   - Name: `meetingmind`
   - Type: Regional
   - Region: pick closest to your Render region (e.g. `us-east-1`)
2. After creation, go to **Details** tab
3. Copy the **Redis URL** — it looks like:
   ```
   rediss://default:abc123@musical-ox-12345.upstash.io:6379
   ```
4. **Save this** — you'll use it for `REDIS_URL`, `CELERY_BROKER_URL`, and `CELERY_RESULT_BACKEND`.

---

## Step 4 — Set Up Cloudflare R2 Storage (10 min)

### 4a. Create R2 buckets

1. Cloudflare dashboard → **R2 Object Storage** (left sidebar)
2. Click **Create bucket**:
   - Name: `meetingmind-audio` → Create
3. Create another bucket:
   - Name: `meetingmind-transcripts` → Create

### 4b. Create R2 API token

1. R2 overview page → **Manage R2 API Tokens** (top right)
2. Click **Create API token**
   - Token name: `meetingmind-backend`
   - Permissions: **Object Read & Write**
   - Bucket access: **Apply to specific buckets** → select both buckets
3. Click **Create API Token**
4. **Save these values:**
   ```
   Account ID:        (shown on R2 overview page, top right)
   Access Key ID:     (shown after creating token)
   Secret Access Key: (shown once — copy it now!)
   ```

### 4c. Enable CORS on R2 buckets (for direct uploads later)

1. Click on `meetingmind-audio` bucket → **Settings** → **CORS Policy**
2. Paste:
   ```json
   [
     {
       "AllowedOrigins": ["*"],
       "AllowedMethods": ["GET", "PUT", "POST"],
       "AllowedHeaders": ["*"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```
3. Repeat for `meetingmind-transcripts`.

---

## Step 5 — Get Your Groq API Key (2 min)

1. Go to https://console.groq.com/keys
2. Click **Create API Key** → name it `meetingmind`
3. **Copy and save the key** (starts with `gsk_...`)

Groq gives you free access to:
- **`llama-3.3-70b-versatile`** — for meeting analysis (smarter than GPT-3.5)
- **`whisper-large-v3`** — for transcription (better than Whisper medium, free)

---

## Step 6 — Deploy Backend to Render (15 min)

### 6a. Connect GitHub

1. Go to https://dashboard.render.com
2. Click **New** → **Blueprint**
3. Connect your GitHub account if not already connected
4. Select the `meetingmind` repository
5. Render will detect `render.yaml` automatically → click **Apply**

### 6b. Set environment variables

Render will create two services: `meetingmind-api` and `meetingmind-worker`.
You need to set the secret env vars **in both services**:

Go to each service → **Environment** → add these:

```
DATABASE_URL          →  (paste Neon connection string from Step 2)
REDIS_URL             →  (paste Upstash Redis URL from Step 3)
CELERY_BROKER_URL     →  (same as REDIS_URL)
CELERY_RESULT_BACKEND →  (same as REDIS_URL)
R2_ACCOUNT_ID         →  (Cloudflare Account ID from Step 4b)
R2_ACCESS_KEY_ID      →  (R2 Access Key ID from Step 4b)
R2_SECRET_ACCESS_KEY  →  (R2 Secret Access Key from Step 4b)
GROQ_API_KEY          →  (Groq key from Step 5)
```

Optional (for notifications):
```
TWILIO_ACCOUNT_SID    →  (from twilio.com/console)
TWILIO_AUTH_TOKEN     →  (from twilio.com/console)
SMTP_USER             →  (your Gmail address)
SMTP_PASSWORD         →  (Gmail App Password — not your login password)
```

### 6c. Fix the DATABASE_URL for async SQLAlchemy

Neon gives you a `postgresql://` URL, but FastAPI needs `postgresql+asyncpg://`.
In Render's environment variables:

```
DATABASE_URL = postgresql+asyncpg://neondb_owner:abc123@ep-cool-name.us-east-2.aws.neon.tech/neondb?ssl=require
```

Also add a sync version for Alembic migrations and Celery:
```
DATABASE_URL_SYNC = postgresql://neondb_owner:abc123@ep-cool-name.us-east-2.aws.neon.tech/neondb?sslmode=require
```

Then update `backend/app/config.py` to read these directly instead of constructing from parts:

```python
# In Settings class, replace the database_url properties with:
database_url: str = "postgresql+asyncpg://..."      # or read from DATABASE_URL env
database_url_sync: str = "postgresql://..."         # or read from DATABASE_URL_SYNC env
```

> **Shortcut:** just paste the Neon URL into both `DATABASE_URL` (change `postgresql://` → `postgresql+asyncpg://`) and `DATABASE_URL_SYNC` (keep `postgresql://`).

### 6d. Wait for deployment

- Both services will build and deploy (~5 min first time)
- Check the `meetingmind-api` logs — you should see:
  ```
  INFO:     Uvicorn running on http://0.0.0.0:10000
  ```
- Copy your API URL: `https://meetingmind-api.onrender.com`

### 6e. Verify the API is working

```bash
curl https://meetingmind-api.onrender.com/health
# Expected: {"status": "ok", "version": "1.0.0"}

# API docs:
open https://meetingmind-api.onrender.com/docs
```

---

## Step 7 — Deploy Frontend to Vercel (5 min)

### 7a. Update the API URL

Before deploying, update `frontend/vercel.json`:
```json
{
  "env": {
    "VITE_API_URL": "https://meetingmind-api.onrender.com/api/v1"
  }
}
```
Replace `meetingmind-api` with your actual Render service name if different.

Commit and push:
```bash
git add -A && git commit -m "chore: set production API URL" && git push
```

### 7b. Deploy to Vercel

**Option A — Vercel dashboard (easier):**
1. Go to https://vercel.com/new
2. Import your `meetingmind` GitHub repository
3. Set **Root Directory** to `frontend`
4. Framework preset: **Vite** (auto-detected)
5. Add environment variable:
   ```
   VITE_API_URL = https://meetingmind-api.onrender.com/api/v1
   ```
6. Click **Deploy**

**Option B — Vercel CLI:**
```bash
cd frontend
npx vercel --prod
# Follow prompts:
# → Set up and deploy: Yes
# → Root directory: ./  (you're already in frontend/)
# → Override settings: No
```

### 7c. Get your deployment URL

Vercel gives you a URL like `https://meetingmind-abc123.vercel.app`.

**Update Render:** go back to both Render services → Environment → update:
```
APP_FRONTEND_URL = https://meetingmind-abc123.vercel.app
```
This fixes CORS so the frontend can talk to the backend.

---

## Step 8 — Run Database Migrations (2 min)

Render runs `alembic upgrade head` automatically on start (via the `startCommand` in `render.yaml`).
To verify:

1. Go to `meetingmind-api` on Render → **Logs**
2. Look for:
   ```
   INFO  [alembic.runtime.migration] Running upgrade -> 0001, Initial schema
   ```

If you need to run migrations manually:
```bash
# From Render dashboard → meetingmind-api → Shell (paid feature)
# OR locally pointing at Neon:
export DATABASE_URL="postgresql://..."   # your Neon sync URL
cd backend && alembic upgrade head
```

---

## Step 9 — Test the Full Flow (5 min)

1. Open your Vercel URL: `https://meetingmind-abc123.vercel.app`
2. Register an account
3. Create an organisation
4. Go to **Upload** and upload a short audio file (even a voice memo from your phone)
5. Watch the status change: `Processing → Transcribing → Analysing → Completed`
6. View the summary, key decisions, and action items

> **Note:** First upload after Render wakes up may take 30–60s. Subsequent ones are fast.

---

## Step 10 — Custom Domain (Optional, Free)

### Frontend custom domain (Vercel)
1. Vercel project → **Settings** → **Domains**
2. Add your domain (e.g. `meetingmind.yourdomain.com`)
3. Add a CNAME record at your DNS provider pointing to `cname.vercel-dns.com`

### Backend custom domain (Render)
1. Render service → **Settings** → **Custom Domains**
2. Add domain → follow DNS instructions

---

## Full Environment Variables Reference

### Backend (both `meetingmind-api` and `meetingmind-worker`)

| Variable | Value | Where to get it |
|----------|-------|-----------------|
| `APP_ENV` | `production` | hardcoded |
| `DATABASE_URL` | `postgresql+asyncpg://...` | Neon dashboard |
| `DATABASE_URL_SYNC` | `postgresql://...` | Neon dashboard |
| `REDIS_URL` | `rediss://...` | Upstash dashboard |
| `CELERY_BROKER_URL` | same as `REDIS_URL` | Upstash dashboard |
| `CELERY_RESULT_BACKEND` | same as `REDIS_URL` | Upstash dashboard |
| `STORAGE_PROVIDER` | `r2` | hardcoded |
| `R2_ACCOUNT_ID` | `abc123...` | Cloudflare R2 overview |
| `R2_ACCESS_KEY_ID` | `abc123...` | Cloudflare R2 token |
| `R2_SECRET_ACCESS_KEY` | `abc123...` | Cloudflare R2 token |
| `R2_BUCKET_AUDIO` | `meetingmind-audio` | hardcoded |
| `R2_BUCKET_TRANSCRIPTS` | `meetingmind-transcripts` | hardcoded |
| `TRANSCRIPTION_PROVIDER` | `groq` | hardcoded |
| `LLM_PROVIDER` | `groq` | hardcoded |
| `GROQ_API_KEY` | `gsk_...` | console.groq.com |
| `GROQ_MODEL` | `llama-3.3-70b-versatile` | hardcoded |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3` | hardcoded |
| `JWT_SECRET_KEY` | (random 64-char string) | generate: `openssl rand -hex 32` |
| `APP_SECRET_KEY` | (random 64-char string) | generate: `openssl rand -hex 32` |
| `APP_FRONTEND_URL` | `https://meetingmind-abc.vercel.app` | your Vercel URL |
| `TWILIO_ACCOUNT_SID` | `AC...` | optional — twilio.com |
| `TWILIO_AUTH_TOKEN` | `...` | optional — twilio.com |
| `SMTP_USER` | `you@gmail.com` | optional |
| `SMTP_PASSWORD` | `xxxx xxxx xxxx xxxx` | optional — Gmail App Password |

### Frontend (Vercel)

| Variable | Value |
|----------|-------|
| `VITE_API_URL` | `https://meetingmind-api.onrender.com/api/v1` |

---

## Architecture on Free Tier

```
User → Vercel CDN (React) → Render API (FastAPI)
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
               Neon DB        Upstash Redis   Cloudflare R2
               (PostgreSQL)   (Celery broker)  (audio files)
                                    │
                              Render Worker
                              (Celery tasks)
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
              Groq Whisper API              Groq LLM API
              (transcription, free)         (analysis, free)
```

---

## Upgrading Beyond Free Tier

When you get paying customers and need more reliability:

| Need | Upgrade to | Cost |
|------|-----------|------|
| No cold starts | Render Starter plan | $7/month |
| More DB storage | Neon Pro | $19/month |
| More Redis | Upstash Pay-as-you-go | ~$0.2/100k cmds |
| Better transcription | Keep Groq (or self-host Whisper on GPU) | $0 |
| Better LLM | Anthropic Claude (for quality) | ~$0.02/meeting |
| Nigerian number | Twilio WhatsApp production | ~$5/month |

---

## Troubleshooting

**"Application failed to respond" on Render**
→ The service is sleeping. Wait 30 seconds and retry. This is normal on the free tier.

**CORS errors in the browser**
→ Update `APP_FRONTEND_URL` in Render to match your exact Vercel URL (no trailing slash).

**Celery tasks not processing**
→ Check `meetingmind-worker` logs on Render. Make sure `CELERY_BROKER_URL` matches `REDIS_URL` exactly.

**Alembic migration errors**
→ Ensure `DATABASE_URL_SYNC` uses `postgresql://` (not `postgresql+asyncpg://`).

**Groq rate limit errors**
→ Check https://console.groq.com/usage — free tier is generous but has per-minute limits. For high traffic, add a retry with backoff (already handled by `tenacity` in storage.py).

**R2 upload errors**
→ Confirm R2 token has Object Read & Write on both buckets. Check `R2_ACCOUNT_ID` is the account ID (not zone ID).
