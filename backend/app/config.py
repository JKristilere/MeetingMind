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

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
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
    transcription_provider: Literal["whisper", "azure"] = "whisper"
    whisper_model_size: str = "medium"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"
    azure_speech_key: str = ""
    azure_speech_region: str = "eastus"

    # LLM
    llm_provider: Literal["ollama", "anthropic", "openai", "azure_openai"] = "ollama"
    ollama_base_url: str = "http://ollama:11434"
    ollama_model: str = "llama3.2"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-6"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"
    azure_openai_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""

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
    email_provider: Literal["resend", "smtp"] = "smtp"
    resend_api_key: str = ""
    smtp_host: str = "mailpit"
    smtp_port: int = 1025
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = "noreply@meetingmind.app"
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
