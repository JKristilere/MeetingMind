import uuid
from pathlib import Path
from typing import BinaryIO

from fastapi import UploadFile
from minio import Minio
from minio.error import S3Error
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings


class StorageService:
    def __init__(self):
        self._client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self._ensure_buckets()

    def _ensure_buckets(self):
        for bucket in (settings.minio_bucket_audio, settings.minio_bucket_transcripts):
            if not self._client.bucket_exists(bucket):
                self._client.make_bucket(bucket)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=1, max=8))
    async def upload_audio(self, file: UploadFile, org_id: uuid.UUID) -> tuple[str, int]:
        ext = Path(file.filename).suffix.lower()
        key = f"{org_id}/{uuid.uuid4()}{ext}"

        content = await file.read()
        size = len(content)

        import io
        self._client.put_object(
            settings.minio_bucket_audio,
            key,
            io.BytesIO(content),
            size,
            content_type=file.content_type or "application/octet-stream",
        )
        return key, size

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
        from datetime import timedelta
        return self._client.presigned_get_object(
            settings.minio_bucket_audio,
            key,
            expires=timedelta(seconds=expires_seconds),
        )

    def download_audio(self, key: str) -> bytes:
        response = self._client.get_object(settings.minio_bucket_audio, key)
        return response.read()

    def save_transcript(self, meeting_id: uuid.UUID, content: str) -> str:
        import io
        key = f"{meeting_id}/transcript.txt"
        encoded = content.encode("utf-8")
        self._client.put_object(
            settings.minio_bucket_transcripts,
            key,
            io.BytesIO(encoded),
            len(encoded),
            content_type="text/plain; charset=utf-8",
        )
        return key

    def delete_audio(self, key: str):
        try:
            self._client.remove_object(settings.minio_bucket_audio, key)
        except S3Error:
            pass
