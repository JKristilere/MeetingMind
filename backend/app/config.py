from functools import lru_cache
from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

# Try candidate .env locations in priority order:
#   1. Two levels up from this file — works when running locally from backend/
#   2. Three levels up — works when running locally from the project root
#   3. /run/secrets/.env — optional Docker secrets mount
# In Docker, env vars are injected by Compose's env_file directive, so the
# file path doesn't matter — pydantic_settings always reads real env vars too.
_ENV_CANDIDATES = [
    Path(__file__).resolve().parents[1] / ".env",   # backend/.env
    Path(__file__).resolve().parents[2] / ".env",   # project-root/.env (local dev)
]
_ENV_FILE = next((p for p in _ENV_CANDIDATES if p.exists()), None)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE) if _ENV_FILE else None,
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_env: Literal["development", "staging", "production"] = "development"
    app_secret_key: str = "change-me"
    app_frontend_url: str = "http://localhost:5173"
    app_backend_url: str = "http://localhost:8000"

    # PostgreSQL
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str = "meetingmind"
    postgres_user: str = "meetingmind"
    postgres_password: str = "meetingmind_secret"

    # Full DSN override — paste your Neon / Supabase / any cloud Postgres URL here.
    # Must use the asyncpg driver prefix:
    #   postgresql+asyncpg://user:pass@host/db?ssl=require
    # When set, the individual POSTGRES_* variables above are ignored.
    database_url_override: str = ""

    @property
    def database_url(self) -> str:
        if self.database_url_override:
            return self.database_url_override
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        if self.database_url_override:
            # Convert asyncpg → psycopg2 for Alembic sync migrations
            return self.database_url_override.replace(
                "postgresql+asyncpg://", "postgresql://"
            ).replace("?ssl=require", "?sslmode=require")
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    # Redis
    redis_url: str = "redis://redis:6379/0"
    celery_broker_url: str = "redis://redis:6379/0"
    celery_result_backend: str = "redis://redis:6379/1"

    # MinIO
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin_secret"
    minio_bucket_audio: str = "meetingmind-audio"
    minio_bucket_transcripts: str = "meetingmind-transcripts"
    minio_secure: bool = False

    # Transcription
    # "whisper" = local faster-whisper (Docker/VPS only)
    # "groq"    = Groq Whisper API  (free cloud — best for Render/portfolio)
    # "azure"   = Azure Speech
    transcription_provider: Literal["whisper", "groq", "azure"] = "whisper"
    whisper_model_size: str = "base"   # tiny/base fit Render free 512 MB RAM
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"

    # LLM
    # "groq"        = Groq (free, fast Llama 3.3-70B — best for portfolio)
    # "ollama"      = local Ollama (Docker only)
    # "anthropic"   = Claude (paid)
    # "openai"      = GPT-4o (paid)
    # "azure_openai"= Azure OpenAI (paid)
    llm_provider: Literal["groq", "ollama", "anthropic", "openai", "azure_openai"] = "ollama"
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"   # free on Groq
    groq_whisper_model: str = "whisper-large-v3"   # free Groq Whisper
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.2"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    azure_openai_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""

    # Storage
    # "minio" = self-hosted MinIO (Docker/VPS -- default for local dev)
    # "b2"    = Backblaze B2 (free 10 GB storage + 1 GB/day download -- best for free deployment)
    # "r2"    = Cloudflare R2 (free 10 GB/month, no egress fees -- requires credit card)
    storage_provider: str = "b2"

    # Backblaze B2 -- set when storage_provider=b2
    # Sign up (no credit card): https://www.backblaze.com/sign-up/cloud-storage
    # Free tier: 10 GB storage, 1 GB download/day, 2 500 API calls/day
    # Endpoint format: https://s3.{region}.backblazeb2.com
    #   (region is shown on the bucket detail page, e.g. us-west-004, eu-central-003)
    b2_endpoint: str = ""              # e.g. https://s3.us-west-004.backblazeb2.com
    b2_key_id: str = ""               # Application Key ID (not your account ID)
    b2_application_key: str = ""      # Application Key
    b2_bucket_audio: str = "meetingmind-audio"
    b2_bucket_transcripts: str = "meetingmind-transcripts"

    # Cloudflare R2 -- set when storage_provider=r2
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_audio: str = "meetingmind-audio"
    r2_bucket_transcripts: str = "meetingmind-transcripts"

    # Auth
    jwt_secret_key: str = "change-me-jwt"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 30
    google_client_id: str = ""
    google_client_secret: str = ""

    # Notifications
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_whatsapp_from: str = "whatsapp:+14155238886"
    # Email — "resend" for production (REST API, no SMTP), "smtp" for dev (Mailpit)
    email_provider: Literal["resend", "smtp"] = "resend"
    resend_api_key: str = ""
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "kristilere21@gmail.com"
    smtp_from_name: str = "MeetingMind"

    # Paystack
    paystack_secret_key: str = ""
    paystack_public_key: str = ""
    paystack_webhook_secret: str = ""

    # Zoom Integration
    # Get these from Marketplace → your app → Feature → Event Subscriptions
    zoom_webhook_secret_token: str = ""  # Secret Token shown on Event Subscriptions page
    zoom_client_id: str = ""
    zoom_client_secret: str = ""

    # CORS — extra origins added to the default whitelist.
    # Set to ["*"] to allow Chrome extensions and other first-party clients.
    # Safe to use with Bearer-token auth because credentials (cookies) are not involved.
    # Example .env value:  CORS_EXTRA_ORIGINS=["*"]
    cors_extra_origins: list[str] = []

    # Feature flags
    enable_google_meet_bot: bool = False
    enable_zoom_bot: bool = False
    enable_whatsapp_notifications: bool = True
    enable_email_notifications: bool = True

    # File limits
    max_upload_size_mb: int = 500
    supported_audio_formats: list[str] = [
        "mp3", "mp4", "wav", "m4a", "ogg", "flac", "webm", "mpeg"
    ]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
