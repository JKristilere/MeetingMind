"""
Storage service -- supports three providers:
  - minio  (self-hosted, local/VPS -- default for Docker Compose)
  - b2     (Backblaze B2, free 10 GB storage + 1 GB/day download -- recommended for free deployment)
  - r2     (Cloudflare R2, free 10 GB/month, no egress fees -- requires credit card)

Switch via the STORAGE_PROVIDER env var.
Both B2 and R2 expose an S3-compatible API, so boto3 is used for all three cloud options.
"""
import io
import re
import uuid
from pathlib import Path

from fastapi import UploadFile
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings


# ── boto3 S3-compatible client factory ───────────────────────────────────────

def _get_s3_client(endpoint_url: str, access_key: str, secret_key: str, region_name: str = "auto"):
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name=region_name,
    )


# ── Provider-specific client factories ───────────────────────────────────────

def _minio_client():
    from minio import Minio
    client = Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )
    for bucket in (settings.minio_bucket_audio, settings.minio_bucket_transcripts):
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
    return client


def _b2_client():
    """Backblaze B2 via its S3-compatible API.

    The endpoint URL encodes the region, e.g.:
        https://s3.us-west-004.backblazeb2.com
    boto3 needs the region string extracted explicitly -- "auto" is not accepted.
    """
    endpoint = settings.b2_endpoint  # e.g. https://s3.us-west-004.backblazeb2.com
    match = re.search(r"s3\.([^.]+\.[^.]+)\.backblazeb2\.com", endpoint)
    region = match.group(1) if match else "us-west-004"
    return _get_s3_client(
        endpoint,
        settings.b2_key_id,
        settings.b2_application_key,
        region_name=region,
    )


def _r2_client():
    endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    return _get_s3_client(endpoint, settings.r2_access_key_id, settings.r2_secret_access_key)


# ── Helpers shared across cloud providers ─────────────────────────────────────

def _cloud_client(provider: str):
    """Return the boto3 client for whichever cloud provider is active."""
    return _b2_client() if provider == "b2" else _r2_client()


def _s3_bucket(provider: str, bucket_type: str) -> str:
    """Return the correct bucket name for the active provider and object type."""
    if provider == "b2":
        return settings.b2_bucket_audio if bucket_type == "audio" else settings.b2_bucket_transcripts
    if provider == "r2":
        return settings.r2_bucket_audio if bucket_type == "audio" else settings.r2_bucket_transcripts
    # minio
    return settings.minio_bucket_audio if bucket_type == "audio" else settings.minio_bucket_transcripts


# ── StorageService ────────────────────────────────────────────────────────────

class StorageService:
    def __init__(self):
        self.provider = settings.storage_provider

    def _is_cloud(self) -> bool:
        return self.provider in ("b2", "r2")

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def upload_audio(self, file: UploadFile, org_id: uuid.UUID) -> tuple[str, int]:
        ext = Path(file.filename).suffix.lower()
        key = f"{org_id}/{uuid.uuid4()}{ext}"
        content = await file.read()
        size = len(content)

        if self._is_cloud():
            client = _cloud_client(self.provider)
            client.put_object(
                Bucket=_s3_bucket(self.provider, "audio"),
                Key=key,
                Body=content,
                ContentLength=size,
                ContentType=file.content_type or "application/octet-stream",
            )
        else:
            client = _minio_client()
            client.put_object(
                settings.minio_bucket_audio,
                key,
                io.BytesIO(content),
                size,
                content_type=file.content_type or "application/octet-stream",
            )
        return key, size

    def download_audio(self, key: str) -> bytes:
        if self._is_cloud():
            client = _cloud_client(self.provider)
            response = client.get_object(Bucket=_s3_bucket(self.provider, "audio"), Key=key)
            return response["Body"].read()
        else:
            client = _minio_client()
            response = client.get_object(settings.minio_bucket_audio, key)
            return response.read()

    def upload_audio_from_bytes(
        self,
        audio_bytes: bytes,
        org_id: uuid.UUID,
        filename: str,
    ) -> tuple[str, int]:
        """Store raw bytes as an audio file.

        Used by the Zoom (and future bot) ingest path where the recording is
        downloaded server-side rather than uploaded directly by the browser.
        """
        ext = Path(filename).suffix.lower() or ".m4a"
        key = f"{org_id}/{uuid.uuid4()}{ext}"
        size = len(audio_bytes)
        content_type_map = {
            ".m4a":  "audio/mp4",
            ".mp4":  "video/mp4",
            ".mp3":  "audio/mpeg",
            ".wav":  "audio/wav",
            ".ogg":  "audio/ogg",
            ".flac": "audio/flac",
            ".webm": "audio/webm",
        }
        content_type = content_type_map.get(ext, "application/octet-stream")

        if self._is_cloud():
            client = _cloud_client(self.provider)
            client.put_object(
                Bucket=_s3_bucket(self.provider, "audio"),
                Key=key,
                Body=audio_bytes,
                ContentLength=size,
                ContentType=content_type,
            )
        else:
            client = _minio_client()
            client.put_object(
                settings.minio_bucket_audio,
                key,
                io.BytesIO(audio_bytes),
                size,
                content_type=content_type,
            )
        return key, size

    def get_audio_url(self, key: str, expires_seconds: int = 3600) -> str:
        if self._is_cloud():
            client = _cloud_client(self.provider)
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": _s3_bucket(self.provider, "audio"), "Key": key},
                ExpiresIn=expires_seconds,
            )
        else:
            from datetime import timedelta
            client = _minio_client()
            return client.presigned_get_object(
                settings.minio_bucket_audio, key,
                expires=timedelta(seconds=expires_seconds),
            )

    def save_transcript(self, meeting_id: uuid.UUID, content: str) -> str:
        key = f"{meeting_id}/transcript.txt"
        encoded = content.encode("utf-8")

        if self._is_cloud():
            client = _cloud_client(self.provider)
            client.put_object(
                Bucket=_s3_bucket(self.provider, "transcripts"),
                Key=key,
                Body=encoded,
                ContentLength=len(encoded),
                ContentType="text/plain; charset=utf-8",
            )
        else:
            client = _minio_client()
            client.put_object(
                settings.minio_bucket_transcripts,
                key,
                io.BytesIO(encoded),
                len(encoded),
                content_type="text/plain; charset=utf-8",
            )
        return key

    def delete_audio(self, key: str):
        try:
            if self._is_cloud():
                _cloud_client(self.provider).delete_object(
                    Bucket=_s3_bucket(self.provider, "audio"), Key=key
                )
            else:
                _minio_client().remove_object(settings.minio_bucket_audio, key)
        except Exception:
            pass
