"""
Storage service — supports two providers:
  - minio  (self-hosted, local/VPS — default for Docker Compose)
  - r2     (Cloudflare R2, free 10 GB/month — recommended for free deployment)

Switch via STORAGE_PROVIDER env var.
R2 is S3-compatible, so boto3 is used for both.
"""
import io
import uuid
from pathlib import Path

from fastapi import UploadFile
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings


def _get_s3_client(endpoint_url: str, access_key: str, secret_key: str):
    import boto3
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        region_name="auto",
    )


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


def _r2_client():
    endpoint = f"https://{settings.r2_account_id}.r2.cloudflarestorage.com"
    return _get_s3_client(endpoint, settings.r2_access_key_id, settings.r2_secret_access_key)


class StorageService:
    def __init__(self):
        self.provider = settings.storage_provider

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def upload_audio(self, file: UploadFile, org_id: uuid.UUID) -> tuple[str, int]:
        ext = Path(file.filename).suffix.lower()
        key = f"{org_id}/{uuid.uuid4()}{ext}"
        content = await file.read()
        size = len(content)

        if self.provider == "r2":
            client = _r2_client()
            client.put_object(
                Bucket=settings.r2_bucket_audio,
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
        if self.provider == "r2":
            client = _r2_client()
            response = client.get_object(Bucket=settings.r2_bucket_audio, Key=key)
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
        """Store raw bytes as an audio file in MinIO.

        Used by the Zoom (and future bot) ingest path where the file is
        downloaded server-side rather than uploaded by the browser.
        """
        import io

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
        self._client.put_object(
            settings.minio_bucket_audio,
            key,
            io.BytesIO(audio_bytes),
            size,
            content_type=content_type,
        )
        return key, size

    def get_audio_url(self, key: str, expires_seconds: int = 3600) -> str:
        if self.provider == "r2":
            client = _r2_client()
            return client.generate_presigned_url(
                "get_object",
                Params={"Bucket": settings.r2_bucket_audio, "Key": key},
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

        if self.provider == "r2":
            client = _r2_client()
            client.put_object(
                Bucket=settings.r2_bucket_transcripts,
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
            if self.provider == "r2":
                _r2_client().delete_object(Bucket=settings.r2_bucket_audio, Key=key)
            else:
                _minio_client().remove_object(settings.minio_bucket_audio, key)
        except Exception:
            pass
