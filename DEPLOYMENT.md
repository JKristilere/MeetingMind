# MeetingMind -- Free Portfolio Deployment Guide

Deploy the full MeetingMind stack for **$0/month** using free tiers from six platforms.
Setup takes about 90 minutes the first time.

---

## The Free Stack

| Layer | Platform | Free Allowance | Credit card? |
|---|---|---|---|
| **Frontend** | [Vercel](https://vercel.com) | Unlimited hobby deploys, CDN, SSL | No |
| **Backend API + Worker** | [Render](https://render.com) | 750 hrs/month free web service | No |
| **PostgreSQL** | [Neon](https://neon.tech) | 0.5 GB, serverless, always-on | No |
| **Redis** | [Upstash](https://upstash.com) | 10 K commands/day, 256 MB | No |
| **Object Storage** | [Backblaze B2](https://www.backblaze.com/sign-up/cloud-storage) | 10 GB storage, 1 GB download/day | **No** |
| **LLM + Transcription** | [Groq](https://console.groq.com) | Llama 3.3-70B + Whisper-large-v3 | No |
| **Email** | [Resend](https://resend.com) | 3 000 emails/month | No |

**Total cost: $0/month. No credit card required for any service.**

> **Render free tier note:** Your backend sleeps after 15 min of inactivity. The first
> request after sleeping takes 30-60 s to respond (cold start). Step 8 shows you how to
> prevent this with a free uptime monitor.

> **Architecture trick:** The backend API and Celery worker both run inside the **same**
> Render web service (via `backend/start-render.sh`), so you never need a separate paid
> background-worker service.

---

## Why Backblaze B2?

| | Backblaze B2 | Cloudflare R2 |
|---|---|---|
| Free storage | 10 GB | 10 GB |
| Free download | 1 GB/day | Unlimited (no egress fee) |
| Credit card | **Not required** | Required (verification only) |
| S3-compatible | Yes | Yes |
| Presigned URLs | Yes | Yes |
| Best for | Portfolio / demos | High-traffic production |

For a portfolio with occasional demo traffic, B2's 1 GB/day free download is more than
enough (a typical meeting audio file is 5-50 MB). No credit card is a significant win.

---

## Prerequisites

- GitHub account with the repo pushed to a public or private repository
- That's it -- no other tools needed locally

---

## Step 0 -- Push to GitHub

```bash
git remote add origin https://github.com/YOUR_USERNAME/MeetingMind.git
git push -u origin main
```

All deployments auto-trigger on GitHub pushes.

---

## Step 1 -- Groq API Key (5 min)

Groq provides **free** access to Llama 3.3-70B (AI analysis) and Whisper-large-v3
(transcription). No credit card required.

1. Go to **https://console.groq.com** -> Sign up
2. Left sidebar -> **API Keys** -> **Create API Key**
3. Name it `meetingmind-prod` -> **Submit**
4. Copy the key -- it starts with `gsk_...`

Save this value; you will paste it as **`GROQ_API_KEY`** in Render later.

---

## Step 2 -- Neon PostgreSQL (10 min)

1. Go to **https://neon.tech** -> Sign up (GitHub login is fastest)
2. **Create a project**:
   - Project name: `meetingmind`
   - Region: `US East (AWS)` (or closest to your Render region)
   - Click **Create Project**
3. On the project page, click **Connect** (top right)
4. Select **Connection string** -> copy it:
   ```
   postgresql://neondb_owner:AbC123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?sslmode=require
   ```
5. **Convert the URL** for async SQLAlchemy (two changes):
   - Change `postgresql://` -> `postgresql+asyncpg://`
   - Change `?sslmode=require` -> `?ssl=require`

   Result:
   ```
   postgresql+asyncpg://neondb_owner:AbC123@ep-cool-name-12345.us-east-2.aws.neon.tech/neondb?ssl=require
   ```

Save this converted URL; you will paste it as **`DATABASE_URL_OVERRIDE`** in Render.

---

## Step 3 -- Upstash Redis (5 min)

1. Go to **https://upstash.com** -> Sign up
2. Click **Create Database**:
   - Name: `meetingmind-redis`
   - Type: **Regional**
   - Region: `US-East-1` (or closest to your Render region)
   - Click **Create**
3. Open the database -> scroll to **Connect** section -> copy the **Redis URL** (TLS):
   ```
   rediss://default:AbCdEfGh@xxx-meetingmind-redis.upstash.io:6380
   ```
   *(Note: `rediss://` with double-s = TLS encrypted)*

Save this URL; you will paste it as **`REDIS_URL`**, **`CELERY_BROKER_URL`**, and
**`CELERY_RESULT_BACKEND`** in Render (all three variables get the same value).

---

## Step 4 -- Backblaze B2 Object Storage (15 min)

Backblaze B2 stores all audio uploads and transcript text files.
**No credit card required.**

### 4a -- Create a Backblaze account

1. Go to **https://www.backblaze.com/sign-up/cloud-storage** -> Sign up
2. Verify your email address

### 4b -- Create two buckets

> **Important:** B2 bucket names are globally unique across all Backblaze customers.
> If `meetingmind-audio` is taken, use something like `meetingmind-audio-yourname`.

1. In the B2 console left sidebar -> **B2 Cloud Storage** -> **Buckets**
2. Click **Create a Bucket**:
   - Bucket Unique Name: `meetingmind-audio` (or `meetingmind-audio-yourname`)
   - Files in Bucket are: **Private**
   - Click **Create a Bucket**
3. **Note the endpoint URL** shown on the bucket detail page -- it looks like:
   ```
   https://s3.us-west-004.backblazeb2.com
   ```
   Save this as **`B2_ENDPOINT`** for Render.

4. Click **Create a Bucket** again:
   - Bucket Unique Name: `meetingmind-transcripts` (or `meetingmind-transcripts-yourname`)
   - Files in Bucket are: **Private**
   - Click **Create a Bucket**

> Both buckets will be in the same region, so both use the same endpoint URL.

### 4c -- Create an Application Key

1. Left sidebar -> **Application Keys**
2. Click **Add a New Application Key**:
   - Name of Key: `meetingmind-backend`
   - Allow access to Bucket(s): **All Buckets** (or select both buckets individually)
   - Type of Access: **Read and Write**
   - Click **Create New Key**
3. **Copy these values immediately** (the Application Key is shown only once):
   - **keyID** -> save as **`B2_KEY_ID`**
   - **applicationKey** -> save as **`B2_APPLICATION_KEY`**

---

## Step 5 -- Resend Email (5 min)

1. Go to **https://resend.com** -> Sign up (no credit card)
2. **API Keys** -> **Create API Key**:
   - Name: `meetingmind`
   - Permission: Full Access
   - Click **Add**
3. Copy the key -- it starts with `re_...`

Save this value as **`RESEND_API_KEY`** for Render.

> **Optional:** Add a custom "from" domain in Resend -> Domains so meeting emails come
> from `noreply@yourdomain.com` instead of `onboarding@resend.dev`.

---

## Step 6 -- Deploy Backend on Render (20 min)

### 6a -- Import via Blueprint

1. Go to **https://render.com** -> sign up with GitHub
2. Click **New** -> **Blueprint**
3. Connect your GitHub account -> select the `MeetingMind` repository
4. Render detects `render.yaml` -> click **Apply**

Render creates the service `meetingmind-api` using the backend's **Dockerfile** (which
includes ffmpeg and libmagic -- required for audio processing). The `start-render.sh`
script runs migrations, starts the Celery worker in the background, then starts uvicorn.

### 6b -- Set secret environment variables

The `render.yaml` marks all credentials as `sync: false` -- you must set them manually.

Click the `meetingmind-api` service -> **Environment** tab -> add each variable:

| Variable | Value |
|---|---|
| `DATABASE_URL_OVERRIDE` | Converted Neon URL from Step 2 |
| `REDIS_URL` | Upstash TLS URL from Step 3 |
| `CELERY_BROKER_URL` | Same as `REDIS_URL` |
| `CELERY_RESULT_BACKEND` | Same as `REDIS_URL` |
| `B2_ENDPOINT` | From Step 4b (e.g. `https://s3.us-west-004.backblazeb2.com`) |
| `B2_KEY_ID` | keyID from Step 4c |
| `B2_APPLICATION_KEY` | applicationKey from Step 4c |
| `B2_BUCKET_AUDIO` | Your audio bucket name (e.g. `meetingmind-audio`) |
| `B2_BUCKET_TRANSCRIPTS` | Your transcripts bucket name (e.g. `meetingmind-transcripts`) |
| `GROQ_API_KEY` | From Step 1 |
| `RESEND_API_KEY` | From Step 5 |
| `APP_BACKEND_URL` | *(leave blank -- fill after first deploy)* |
| `APP_FRONTEND_URL` | *(leave blank -- fill after Vercel deploy)* |

Click **Save Changes** -> Render starts the first build.

### 6c -- Wait for first build

The initial Docker build takes **8-12 minutes** (downloading the base image and pip
installing all packages). Watch the logs stream in real time.

A successful start looks like:
```
==> Running database migrations...
INFO  [alembic] Running upgrade -> 0001, Initial schema
=> Migrations complete
==> Starting Celery worker (background)...
=> Celery worker started (PID=12)
==> Starting FastAPI on port 10000...
INFO:     Application startup complete.
```

### 6d -- Note your Render URL

After the deploy succeeds, copy the service URL from the top of the Render service page:
```
https://meetingmind-api.onrender.com
```

Go back to **Environment** -> set `APP_BACKEND_URL` to this URL -> **Save Changes**.

### 6e -- Verify the API

```bash
curl https://meetingmind-api.onrender.com/health
# -> {"status":"ok","version":"1.0.0"}
```

API docs (development only) are also live at:
```
https://meetingmind-api.onrender.com/docs
```

---

## Step 7 -- Deploy Frontend on Vercel (15 min)

### 7a -- Import the project

1. Go to **https://vercel.com** -> **Add New** -> **Project**
2. Import your `MeetingMind` GitHub repository
3. On the configuration screen:
   - **Root Directory:** click **Edit** -> type `frontend` -> **Continue**
   - **Framework Preset:** Vite *(auto-detected)*
   - **Build Command:** `npm run build` *(auto-filled)*
   - **Output Directory:** `dist` *(auto-filled)*

### 7b -- Add environment variable

Under **Environment Variables**, add:

| Name | Value |
|---|---|
| `VITE_API_URL` | `https://meetingmind-api.onrender.com/api/v1` |

*(Use your actual Render URL from Step 6d.)*

### 7c -- Deploy

Click **Deploy**. Vercel builds and deploys in ~2 minutes.

Your frontend is live at something like:
```
https://meetingmind-xyz.vercel.app
```

### 7d -- Update CORS in Render

Go back to Render -> `meetingmind-api` -> **Environment** -> set:

```
APP_FRONTEND_URL = https://meetingmind-xyz.vercel.app
```

Click **Save Changes** -> Render redeploys (~2 min). This adds your Vercel domain to the
backend's CORS whitelist so the browser can make API calls.

---

## Step 8 (Optional, Recommended) -- Keep Render Awake

Free Render services sleep after 15 min of inactivity. Add a **free** uptime monitor to
keep it warm for portfolio visitors:

1. Sign up at **https://uptimerobot.com** (free)
2. **Add New Monitor**:
   - Monitor Type: **HTTP(s)**
   - Friendly Name: `MeetingMind API`
   - URL: `https://meetingmind-api.onrender.com/health`
   - Monitoring Interval: **5 minutes**
3. Click **Create Monitor**

UptimeRobot pings the `/health` endpoint every 5 minutes, preventing the 30-second cold
start for your portfolio visitors.

---

## Step 9 -- End-to-End Test (5 min)

1. Open your Vercel URL in a browser
2. Click **Sign Up** -> create an account
3. Go to **Settings** -> **Organisation** -> create a workspace
4. Go to **Upload** -> upload any short audio/video file (a voice memo works fine)
5. Watch the status change: `Pending -> Processing -> Transcribed -> Analysing -> Completed`
6. Open the meeting -> verify the summary, key decisions, and action items appear
7. Check your inbox for the email notification

> If the page takes 30+ seconds on first load, Render was sleeping -- it will be fast
> after that. Add UptimeRobot from Step 8 to prevent this for demo visitors.

---

## Full Environment Variable Reference

All values to set in Render's Environment dashboard:

```env
# ── App (auto-generated by Render) ──────────────────────────────────────
APP_ENV=production
APP_SECRET_KEY=<auto-generated>
JWT_SECRET_KEY=<auto-generated>

# ── URLs (fill after both deploys are live) ──────────────────────────────
APP_BACKEND_URL=https://meetingmind-api.onrender.com
APP_FRONTEND_URL=https://YOUR-APP.vercel.app

# ── Database -- Neon ─────────────────────────────────────────────────────
# Format: postgresql+asyncpg://user:pass@host/db?ssl=require
DATABASE_URL_OVERRIDE=postgresql+asyncpg://neondb_owner:PASS@ep-xxx.us-east-2.aws.neon.tech/neondb?ssl=require

# ── Redis -- Upstash (all three get the same value) ──────────────────────
REDIS_URL=rediss://default:TOKEN@xxx.upstash.io:6380
CELERY_BROKER_URL=rediss://default:TOKEN@xxx.upstash.io:6380
CELERY_RESULT_BACKEND=rediss://default:TOKEN@xxx.upstash.io:6380

# ── Storage -- Backblaze B2 ──────────────────────────────────────────────
STORAGE_PROVIDER=b2
B2_ENDPOINT=https://s3.us-west-004.backblazeb2.com
B2_KEY_ID=your-application-key-id
B2_APPLICATION_KEY=your-application-key
B2_BUCKET_AUDIO=meetingmind-audio
B2_BUCKET_TRANSCRIPTS=meetingmind-transcripts

# ── Groq -- free LLM + Whisper ───────────────────────────────────────────
LLM_PROVIDER=groq
TRANSCRIPTION_PROVIDER=groq
GROQ_API_KEY=gsk_...
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_WHISPER_MODEL=whisper-large-v3

# ── Email -- Resend ──────────────────────────────────────────────────────
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_...
SMTP_FROM_EMAIL=noreply@meetingmind.app
SMTP_FROM_NAME=MeetingMind

# ── Feature flags ────────────────────────────────────────────────────────
ENABLE_EMAIL_NOTIFICATIONS=true
ENABLE_WHATSAPP_NOTIFICATIONS=false
```

### Vercel Environment Variables

Set in Vercel dashboard -> Project -> Settings -> Environment Variables:

| Variable | Value |
|---|---|
| `VITE_API_URL` | `https://meetingmind-api.onrender.com/api/v1` |

---

## Architecture Diagram (Free Tier)

```
Browser
  |
  v
Vercel CDN ─────────────── React SPA (static files)
  |                         VITE_API_URL points to ->
  v
Render Web Service (Docker, 512 MB free)
  |- FastAPI (uvicorn, port 10000)
  `- Celery Worker (same container, concurrency=1)
          |
          |-- Neon PostgreSQL   (meetings, users, orgs, action items)
          |-- Upstash Redis     (task queue / result backend)
          |-- Backblaze B2      (audio uploads, transcript files)
          |-- Groq Whisper API  (transcription, free)
          |-- Groq Llama API    (AI analysis, free)
          `-- Resend API        (email notifications, free)
```

---

## Alternative: Oracle Cloud Always Free (Self-Hosted)

For a more powerful setup with no sleep, local Whisper, and local LLM (Ollama), Oracle
Cloud offers permanently free ARM virtual machines -- powerful enough to run the full
Docker Compose stack.

**What you get (free forever):**
- 4 ARM OCPUs + 24 GB RAM (Ampere A1 shape) -- enough for Whisper + Ollama
- 200 GB block storage
- 10 TB outbound bandwidth/month

### Quick Oracle Setup

1. Sign up at **https://cloud.oracle.com** -> "Start for free"
   *(credit card required for account verification, not charged)*
2. Create a VM instance:
   - Shape: `VM.Standard.A1.Flex`
   - OCPUs: 4 -- RAM: 24 GB
   - OS: Ubuntu 22.04 LTS -- Boot volume: 100 GB
   - Download the SSH key pair
3. SSH into the VM:
   ```bash
   ssh -i ~/path/to/key.pem ubuntu@YOUR-VM-PUBLIC-IP
   ```
4. Install Docker:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER && newgrp docker
   sudo apt-get install -y docker-compose-plugin
   ```
5. Clone and start:
   ```bash
   git clone https://github.com/YOUR_USERNAME/MeetingMind.git
   cd MeetingMind
   cp .env.example .env
   # Edit .env: set APP_SECRET_KEY and JWT_SECRET_KEY at minimum
   bash scripts/setup.sh
   ```
6. Expose publicly via free Cloudflare Tunnel (no firewall port-forwarding required):
   ```bash
   # Install cloudflared for Linux ARM64
   wget https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64
   chmod +x cloudflared-linux-arm64 && sudo mv cloudflared-linux-arm64 /usr/local/bin/cloudflared

   cloudflared tunnel login         # opens browser
   cloudflared tunnel create meetingmind
   cloudflared tunnel route dns meetingmind meetingmind.yourdomain.com
   cloudflared tunnel run meetingmind
   ```

On Oracle Cloud the full `docker-compose.yml` stack runs with local Whisper and Ollama --
no Groq API key needed.

---

## Troubleshooting

### "Application failed to start" on Render
- Check Render logs for Python errors or missing env vars
- `DATABASE_URL_OVERRIDE` must start with `postgresql+asyncpg://` and end with `?ssl=require`
- `REDIS_URL` must start with `rediss://` (double-s = TLS)
- `B2_ENDPOINT` must start with `https://` and end in `.backblazeb2.com`

### B2 upload errors (403 / NoSuchBucket)
- Confirm the bucket names in `B2_BUCKET_AUDIO` and `B2_BUCKET_TRANSCRIPTS` match
  **exactly** what you created in the Backblaze console (including any `-yourname` suffix)
- Confirm `B2_KEY_ID` is the **Application Key ID** (not your Backblaze account ID)
- Confirm the application key has **Read and Write** access to both buckets
- `B2_ENDPOINT` must match the region shown on the bucket detail page

### Frontend shows "Network Error"
- Open browser DevTools -> Network tab -> check which requests are failing
- `VITE_API_URL` in Vercel must be `https://YOUR-SERVICE.onrender.com/api/v1` (no trailing slash)
- `APP_FRONTEND_URL` in Render must be your exact Vercel URL (no trailing slash)

### Transcription/AI analysis stuck on "Processing"
- Check Render logs for `=> Celery worker started` -- if missing, the worker didn't launch
- Verify `GROQ_API_KEY` is set with no leading/trailing spaces
- Groq free-tier limits: ~30 req/min for LLM, ~7 200 req/hour for Whisper

### CORS errors in browser console
- `APP_FRONTEND_URL` must match the Vercel URL exactly, including `https://` and no trailing slash
- After changing, wait for Render to finish redeploying before testing again

---

## Deployment Checklist

- [ ] Repo pushed to GitHub (`main` branch)
- [ ] Groq API key obtained and saved
- [ ] Neon PostgreSQL project created, connection string converted to `postgresql+asyncpg://...?ssl=require`
- [ ] Upstash Redis created, `rediss://` TLS URL saved
- [ ] Backblaze B2: two buckets created, Application Key created with keyID and applicationKey saved
- [ ] B2 endpoint URL (e.g. `https://s3.us-west-004.backblazeb2.com`) noted
- [ ] Resend API key obtained
- [ ] Render Blueprint applied (`render.yaml` auto-detected)
- [ ] All environment variables set in Render dashboard (see table in Step 6b)
- [ ] First Render build succeeded ("Application startup complete" in logs)
- [ ] Render URL noted (`https://meetingmind-api.onrender.com`)
- [ ] `APP_BACKEND_URL` set in Render
- [ ] Vercel project created with `frontend` as root directory
- [ ] `VITE_API_URL` set in Vercel environment variables
- [ ] Vercel deploy succeeded, URL noted
- [ ] `APP_FRONTEND_URL` updated in Render -> redeployed
- [ ] UptimeRobot monitor added (optional but recommended for portfolio)
- [ ] End-to-end test: register -> create org -> upload audio -> receive summary email
