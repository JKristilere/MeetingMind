# MeetingMind — Free Portfolio Deployment Guide

Deploy the full MeetingMind stack for **$0/month** using free tiers from six platforms.
Setup takes about 90 minutes the first time.

---

## The Free Stack

| Layer | Platform | Free Allowance | Signup URL |
|---|---|---|---|
| **Frontend** | Vercel | Unlimited hobby deploys, CDN, SSL | https://vercel.com |
| **Backend API + Worker** | Render | 750 hrs/month free web service | https://render.com |
| **PostgreSQL** | Neon | 0.5 GB, serverless, always-on | https://neon.tech |
| **Redis** | Upstash | 10 K commands/day, 256 MB | https://upstash.com |
| **Object Storage** | Cloudflare R2 | 10 GB/month, 10 M reads, no egress fee | https://dash.cloudflare.com |
| **LLM + Transcription** | Groq | Llama 3.3-70B + Whisper-large-v3 | https://console.groq.com |
| **Email** | Resend | 3 000 emails/month | https://resend.com |

> **Render free tier note:** Your backend sleeps after 15 min of inactivity. The first request after sleeping takes 30–60 s to respond (cold start). Add an uptime monitor in Step 8 to prevent this for demos.

> **Architecture trick:** The backend API and Celery worker both run inside the **same** Render web service (via `backend/start-render.sh`). This avoids needing a separate paid Render background-worker service.

---

## Prerequisites

- GitHub account — repo pushed to a public or private GitHub repo
- Credit card for Cloudflare R2 (no charge under 10 GB/month — just for account verification)

---

## Step 0 — Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/MeetingMind.git
git push -u origin main
```

All deployments auto-trigger from GitHub pushes.

---

## Step 1 — Groq API Key (5 min)

Groq provides **free** access to Llama 3.3-70B (AI analysis) and Whisper-large-v3 (transcription). No credit card required.

1. Go to **https://console.groq.com** → Sign up
2. Left sidebar → **API Keys** → **Create API Key**
3. Name it `meetingmind-prod` → **Submit**
4. Copy the key — it starts with `gsk_...`

Save this value — you will paste it as **`GROQ_API_KEY`** in Render later.

---

## Step 2 — Neon PostgreSQL (10 min)

1. Go to **https://neon.tech** → Sign up (GitHub login is fastest)
2. **Create a project**:
   - Project name: `meetingmind`
   - Region: `US East (AWS)` (or closest to your Render region)
   - Click **Create Project**
3. On the project page, click **Connect** (top right)
4. Select **Connection string** → copy it:
   ```
   postgresql://neondb_owner:AbC123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
5. **Convert the URL** for async SQLAlchemy (two changes):
   - Change `postgresql://` → `postgresql+asyncpg://`
   - Change `?sslmode=require` → `?ssl=require`

   Result:
   ```
   postgresql+asyncpg://neondb_owner:AbC123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?ssl=require
   ```

Save this converted URL — you will paste it as **`DATABASE_URL_OVERRIDE`** in Render.

---

## Step 3 — Upstash Redis (5 min)

1. Go to **https://upstash.com** → Sign up
2. Click **Create Database**:
   - Name: `meetingmind-redis`
   - Type: **Regional**
   - Region: `US-East-1` (or closest to your Render region)
   - Click **Create**
3. Open the database → scroll to **Connect** section → copy the **Redis URL** (TLS):
   ```
   rediss://default:AbCdEfGh@xxx-meetingmind-redis.upstash.io:6380
   ```
   *(Note: `rediss://` with double-s = TLS)*

Save this URL — you will paste it as **`REDIS_URL`**, **`CELERY_BROKER_URL`**, and **`CELERY_RESULT_BACKEND`** in Render (all three variables get the same value).

---

## Step 4 — Cloudflare R2 Object Storage (15 min)

> ⚠️ A credit card is required to activate R2, but you are **not charged** for usage under 10 GB/month.

### 4a — Activate R2

1. Go to **https://dash.cloudflare.com** → sign up / log in
2. Left sidebar → **R2 Object Storage** → click **Purchase R2 Plan** (it's the free plan — the button is misleading)
3. Enter your credit card → Confirm

### 4b — Create two buckets

1. R2 dashboard → **Create bucket**:
   - Bucket name: `meetingmind-audio`
   - Location: Automatic
   - Click **Create bucket**
2. **Create bucket** again:
   - Bucket name: `meetingmind-transcripts`
   - Click **Create bucket**

### 4c — Create an API token

1. R2 dashboard → **Manage R2 API Tokens** (top-right link)
2. Click **Create API token**:
   - Token name: `meetingmind-backend`
   - Permissions: **Object Read & Write**
   - Specify bucket: select both `meetingmind-audio` and `meetingmind-transcripts`
   - TTL: No expiry
3. Click **Create API Token** — note down:
   - **Account ID** — found in the R2 dashboard URL: `dash.cloudflare.com/**ACCOUNT_ID**/r2/...`
   - **Access Key ID** — shown in the token confirmation screen
   - **Secret Access Key** — shown **once only** — copy it now!

Save all three values for Render.

---

## Step 5 — Resend Email (5 min)

1. Go to **https://resend.com** → Sign up (no credit card)
2. **API Keys** → **Create API Key**:
   - Name: `meetingmind`
   - Permission: Full Access
   - Click **Add**
3. Copy the key — it starts with `re_...`

Save this value as **`RESEND_API_KEY`** for Render.

> **Optional:** Add a custom "from" domain in Resend → Domains so meeting emails come from `noreply@yourdomain.com` instead of `onboarding@resend.dev`.

---

## Step 6 — Deploy Backend on Render (20 min)

### 6a — Import via Blueprint

1. Go to **https://render.com** → sign up with GitHub
2. Click **New** → **Blueprint**
3. Connect your GitHub account → select the `MeetingMind` repository
4. Render detects `render.yaml` → click **Apply**

Render creates the service `meetingmind-api` using the backend's **Dockerfile** (which includes ffmpeg and libmagic — required for audio processing).

### 6b — Set secret environment variables

The `render.yaml` marks all credentials as `sync: false` — you must set them manually.

Click the `meetingmind-api` service → **Environment** tab → add each variable:

| Variable | Value |
|---|---|
| `DATABASE_URL_OVERRIDE` | Converted Neon URL from Step 2 |
| `REDIS_URL` | Upstash TLS URL from Step 3 |
| `CELERY_BROKER_URL` | Same as `REDIS_URL` |
| `CELERY_RESULT_BACKEND` | Same as `REDIS_URL` |
| `R2_ACCOUNT_ID` | Cloudflare Account ID from Step 4c |
| `R2_ACCESS_KEY_ID` | From Step 4c |
| `R2_SECRET_ACCESS_KEY` | From Step 4c |
| `GROQ_API_KEY` | From Step 1 |
| `RESEND_API_KEY` | From Step 5 |
| `APP_BACKEND_URL` | *(leave blank — fill after first deploy)* |
| `APP_FRONTEND_URL` | *(leave blank — fill after Vercel deploy)* |

Click **Save Changes** — Render starts the first build.

### 6c — Wait for first build

The initial Docker build takes **8–12 minutes** (downloading base image + pip installing all packages). Watch the logs stream in real time.

A successful start looks like:
```
==> Running database migrations...
INFO  [alembic] Running upgrade -> 0001, Initial schema
✔ Migrations complete
==> Starting Celery worker (background)...
✔ Celery worker started (PID=12)
==> Starting FastAPI on port 10000...
INFO:     Application startup complete.
```

### 6d — Note your Render URL

After deploy succeeds, copy the service URL from the top of the Render service page:
```
https://meetingmind-api.onrender.com
```

Go back to **Environment** → set `APP_BACKEND_URL` to this URL → **Save Changes**.

### 6e — Verify the API

```bash
curl https://meetingmind-api.onrender.com/health
# → {"status":"ok","version":"1.0.0"}
```

The API docs are also available at:
```
https://meetingmind-api.onrender.com/docs
```

---

## Step 7 — Deploy Frontend on Vercel (15 min)

### 7a — Import the project

1. Go to **https://vercel.com** → **Add New** → **Project**
2. Import your `MeetingMind` GitHub repository
3. On the configuration screen:
   - **Root Directory:** click **Edit** → type `frontend` → **Continue**
   - **Framework Preset:** Vite *(auto-detected)*
   - **Build Command:** `npm run build` *(auto-filled)*
   - **Output Directory:** `dist` *(auto-filled)*

### 7b — Add environment variable

Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://meetingmind-api.onrender.com/api/v1` |

*(Use your actual Render URL from Step 6d.)*

### 7c — Deploy

Click **Deploy**. Vercel builds and deploys in ~2 minutes.

Your frontend is live at:
```
https://meetingmind-xyz.vercel.app
```

### 7d — Update CORS in Render

Go back to Render → `meetingmind-api` → **Environment** → set:

```
APP_FRONTEND_URL = https://meetingmind-xyz.vercel.app
```

Click **Save Changes** → Render redeploys (~2 min). This adds your Vercel domain to the backend's CORS whitelist.

---

## Step 8 (Optional, Recommended) — Keep Render Awake

Free Render services sleep after 15 min of inactivity. Add a **free** uptime monitor to keep it warm for portfolio visitors:

1. Sign up at **https://uptimerobot.com** (free)
2. **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `MeetingMind API`
   - URL: `https://meetingmind-api.onrender.com/health`
   - Monitoring Interval: **5 minutes**
3. Click **Create Monitor**

UptimeRobot pings the health endpoint every 5 minutes — preventing the 30-second cold start for your portfolio visitors.

---

## Step 9 — End-to-End Test (5 min)

1. Open your Vercel URL in a browser
2. Click **Sign Up** → create an account
3. Go to **Settings** → **Organisation** → create a workspace
4. Go to **Upload** → upload any short audio/video file (a voice memo works fine)
5. Watch the status change: `Pending → Processing → Transcribed → Analysing → Completed`
6. Open the meeting → verify summary, key decisions, action items appear
7. Check your email inbox for the notification

> **If the page takes 30+ seconds on first load**, Render was sleeping — it will be fast after that. Add UptimeRobot from Step 8 to prevent this.

---

## Full Environment Variable Reference

All values you need to set in Render's Environment dashboard:

```env
# ── App (auto-generated by Render) ──────────────────────────────────────
APP_ENV=production
APP_SECRET_KEY=<auto-generated>
JWT_SECRET_KEY=<auto-generated>

# ── URLs (fill after both deploys are live) ──────────────────────────────
APP_BACKEND_URL=https://meetingmind-api.onrender.com
APP_FRONTEND_URL=https://YOUR-APP.vercel.app

# ── Database — Neon ──────────────────────────────────────────────────────
# Format: postgresql+asyncpg://user:pass@host/db?ssl=require
DATABASE_URL_OVERRIDE=postgresql+asyncpg://neondb_owner:PASS@ep-xxx.us-east-2.aws.neon.tech/neondb?ssl=require

# ── Redis — Upstash (all three get the same value) ───────────────────────
REDIS_URL=rediss://default:TOKEN@xxx.upstash.io:6380
CELERY_BROKER_URL=rediss://default:TOKEN@xxx.upstash.io:6380
CELERY_RESULT_BACKEND=rediss://default:TOKEN@xxx.upstash.io:6380

# ── Storage — Cloudflare R2 ──────────────────────────────────────────────
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=abc123...
R2_ACCESS_KEY_ID=abc123...
R2_SECRET_ACCESS_KEY=secret...
R2_BUCKET_AUDIO=meetingmind-audio
R2_BUCKET_TRANSCRIPTS=meetingmind-transcripts

# ── Groq — free LLM + Whisper ────────────────────────────────────────────
LLM_PROVIDER=groq
TRANSCRIPTION_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_WHISPER_MODEL=whisper-large-v3

# ── Email — Resend ───────────────────────────────────────────────────────
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
SMTP_FROM_EMAIL=noreply@meetingmind.app
SMTP_FROM_NAME=MeetingMind

# ── Feature flags ────────────────────────────────────────────────────────
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_WHATSAPP_NOTIFICATIONS=false
```

### Vercel Environment Variables

Set in Vercel dashboard → Project → Settings → Environment Variables:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://meetingmind-api.onrender.com/api/v1` |

---

## Architecture Diagram (Free Tier)

```
Browser
  │
  ▼
Vercel CDN ─────────────── React SPA (static files)
  │                         VITE_API_URL ↓
  │                         https://meetingmind-api.onrender.com
  │
  ▼
Render Web Service (Docker) ──────────────────────────────────────────┐
│  FastAPI (uvicorn, port 10000)                                       │
│  Celery Worker (background thread, concurrency=1)                   │
│         │                                                            │
│    Upstash Redis ←→ task queue ←→ Groq Whisper API (transcription)  │
│         │                    ←→ Groq Llama API   (AI analysis)       │
│         ▼                    ←→ Resend API       (email)             │
│    Neon PostgreSQL (meetings, users, orgs, action items)             │
│    Cloudflare R2   (audio uploads, transcript text files)            │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Alternative: Oracle Cloud Always Free (Self-Hosted)

For a more powerful setup with **no sleep**, **local Whisper**, and **local LLM** (Ollama), Oracle Cloud offers permanently free ARM virtual machines.

**What you get (free forever):**
- 4 ARM OCPUs + 24 GB RAM (Ampere A1 shape) — runs the entire Docker stack
- 200 GB block storage
- 10 TB outbound bandwidth/month

### Quick Oracle Setup

1. Sign up at **https://cloud.oracle.com** → "Start for free" *(credit card required, not charged)*
2. Create a VM:
   - **Shape:** VM.Standard.A1.Flex
   - **OCPUs:** 4 — **RAM:** 24 GB
   - **OS:** Ubuntu 22.04 LTS
   - **Boot volume:** 100 GB
   - Download the SSH key pair
3. SSH into the VM:
   ```bash
   ssh -i ~/path/to/key.pem ubuntu@YOUR-VM-PUBLIC-IP
   ```
4. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   sudo apt-get install -y docker-compose-plugin
   newgrp docker
   ```
5. Clone and configure:
   ```bash
   git clone https://github.com/YOUR_USERNAME/MeetingMind.git
   cd MeetingMind
   cp .env.example .env
   nano .env
   # Set at minimum:
   #   APP_SECRET_KEY=<openssl rand -hex 32>
   #   JWT_SECRET_KEY=<openssl rand -hex 32>
   ```
6. Start everything (downloads Ollama LLaMA + Whisper ~4 GB first run):
   ```bash
   bash scripts/setup.sh
   ```
7. Expose via free Cloudflare Tunnel (no port forwarding needed):
   ```bash
   # Install cloudflared
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
   chmod +x cloudflared-linux-arm64 && sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared

   # Authenticate (opens browser)
   cloudflared tunnel login

   # Create tunnel
   cloudflared tunnel create meetingmind
   cloudflared tunnel route dns meetingmind meetingmind.yourdomain.com

   # Run (add to systemd for persistence)
   cloudflared tunnel run meetingmind
   ```

On Oracle Cloud you can run the **full** `docker-compose.yml` stack including local Whisper and Ollama with no API keys needed.

---

## Troubleshooting

### "Application failed to start" on Render
- Check Render logs → look for Python errors or missing env vars
- Confirm `DATABASE_URL_OVERRIDE` starts with `postgresql+asyncpg://` and ends with `?ssl=require`
- Confirm Redis URL starts with `rediss://` (double-s = TLS)

### Frontend shows "Network Error"
- Open browser DevTools → Network tab → check which requests are failing
- Confirm `VITE_API_URL` in Vercel matches exactly: `https://YOUR-SERVICE.onrender.com/api/v1`
- Confirm `APP_FRONTEND_URL` in Render matches your Vercel URL with no trailing slash

### Transcription/AI analysis stuck on "Processing"
- Check Render logs for Celery task output
- Look for `✔ Celery worker started` in the startup logs — if missing, the worker didn't start
- Verify `GROQ_API_KEY` is set and has no extra spaces

### CORS errors in browser console
- `APP_FRONTEND_URL` must match **exactly** (including `https://`, no trailing slash)
- After changing, Render redeploys — wait for it to finish

### Groq rate limit (429 errors)
- Groq free tier: ~30 req/min for LLM, ~7 200 req/hour for Whisper
- For demos this is more than sufficient; just don't upload many files in parallel

### R2 upload errors
- Verify the R2 API token has `Object Read & Write` on both buckets
- `R2_ACCOUNT_ID` should be the account ID (from the URL: `dash.cloudflare.com/ACCOUNT_ID/r2`)
- Not to be confused with the R2 zone ID

---

## Deployment Checklist

- [ ] Repo pushed to GitHub (`main` branch)
- [ ] Groq API key obtained and saved
- [ ] Neon project created, connection string converted to `postgresql+asyncpg://...?ssl=require`
- [ ] Upstash Redis created, `rediss://` URL saved
- [ ] Cloudflare R2: two buckets created, API token with all three values saved
- [ ] Resend API key obtained
- [ ] Render Blueprint applied (`render.yaml` detected)
- [ ] All environment variables set in Render dashboard (see table above)
- [ ] First Render build succeeded (check logs for "Application startup complete")
- [ ] Render URL noted (`https://meetingmind-api.onrender.com`)
- [ ] `APP_BACKEND_URL` set in Render
- [ ] Vercel project created with `frontend` as root directory
- [ ] `VITE_API_URL` set in Vercel environment variables
- [ ] Vercel deploy succeeded, URL noted
- [ ] `APP_FRONTEND_URL` updated in Render → redeployed
- [ ] UptimeRobot monitor added (optional but recommended for portfolio)
- [ ] End-to-end test: register → create org → upload audio → receive summary email ✅
