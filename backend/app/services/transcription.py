"""
Transcription service — supports three providers:
  - faster-whisper  (local, open source — Docker/VPS only; needs ≥1 GB RAM)
  - groq            (Groq Whisper API — FREE, fast, perfect for Render/portfolio)
  - azure           (Azure Speech-to-Text — paid cloud)

Switch via TRANSCRIPTION_PROVIDER env var.

For free cloud deployment (Render free tier, 512 MB RAM):
  Set TRANSCRIPTION_PROVIDER=groq and add GROQ_API_KEY.
  Groq's Whisper large-v3 is free and handles Nigerian English well.
"""
import tempfile
import os
from dataclasses import dataclass
from typing import Optional

from app.config import settings


@dataclass
class TranscriptSegment:
    start: float
    end: float
    text: str
    speaker: Optional[str] = None
    confidence: Optional[float] = None


@dataclass
class TranscriptionResult:
    text: str
    segments: list[TranscriptSegment]
    detected_language: str
    confidence: float
    word_count: int


class GroqTranscriptionService:
    """
    Groq Whisper API — free tier, extremely fast (~10s for 30-min audio).
    Uses whisper-large-v3 which handles Nigerian English & code-switching well.
    Sign up free at console.groq.com
    """

    def transcribe(self, audio_bytes: bytes, language_hint: str | None = None) -> TranscriptionResult:
        from groq import Groq

        client = Groq(api_key=settings.groq_api_key)

        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            with open(tmp_path, "rb") as audio_file:
                kwargs = {
                    "file": audio_file,
                    "model": settings.groq_whisper_model,
                    "response_format": "verbose_json",
                    "timestamp_granularities": ["segment"],
                }
                if language_hint and language_hint != "auto":
                    kwargs["language"] = language_hint

                transcription = client.audio.transcriptions.create(**kwargs)

            segments = []
            if hasattr(transcription, "segments") and transcription.segments:
                for seg in transcription.segments:
                    segments.append(TranscriptSegment(
                        start=seg.start,
                        end=seg.end,
                        text=seg.text.strip(),
                        confidence=getattr(seg, "avg_logprob", None),
                    ))

            full_text = transcription.text or ""
            detected_lang = getattr(transcription, "language", language_hint or "en")

            return TranscriptionResult(
                text=full_text,
                segments=segments,
                detected_language=detected_lang,
                confidence=0.9,
                word_count=len(full_text.split()),
            )
        finally:
            os.unlink(tmp_path)


class WhisperTranscriptionService:
    """
    Local transcription using faster-whisper.
    Use this with Docker Compose or a VPS with ≥2 GB RAM.
    Set WHISPER_MODEL_SIZE=base for Render's 512 MB free tier (lower accuracy).
    Set WHISPER_MODEL_SIZE=medium or large-v3 on a paid VPS for best accuracy.
    """

    _model = None

    @classmethod
    def _get_model(cls):
        if cls._model is None:
            from faster_whisper import WhisperModel
            cls._model = WhisperModel(
                settings.whisper_model_size,
                device=settings.whisper_device,
                compute_type=settings.whisper_compute_type,
            )
        return cls._model

    def transcribe(self, audio_bytes: bytes, language_hint: str | None = None) -> TranscriptionResult:
        model = self._get_model()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            kwargs = {"beam_size": 5, "vad_filter": True}
            if language_hint and language_hint != "auto":
                kwargs["language"] = language_hint

            segments_iter, info = model.transcribe(tmp_path, **kwargs)
            segments = []
            full_text_parts = []

            for seg in segments_iter:
                segments.append(TranscriptSegment(
                    start=seg.start,
                    end=seg.end,
                    text=seg.text.strip(),
                    confidence=seg.avg_logprob,
                ))
                full_text_parts.append(seg.text.strip())

            full_text = " ".join(full_text_parts)
            avg_confidence = (
                sum(s.confidence for s in segments if s.confidence) / len(segments)
                if segments else 0.0
            )

            return TranscriptionResult(
                text=full_text,
                segments=segments,
                detected_language=info.language,
                confidence=float(avg_confidence),
                word_count=len(full_text.split()),
            )
        finally:
            os.unlink(tmp_path)


class AzureTranscriptionService:
    def transcribe(self, audio_bytes: bytes, language_hint: str | None = None) -> TranscriptionResult:
        import azure.cognitiveservices.speech as speechsdk
        import time

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region,
        )
        speech_config.speech_recognition_language = language_hint or "en-NG"

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            audio_config = speechsdk.AudioConfig(filename=tmp_path)
            recognizer = speechsdk.SpeechRecognizer(
                speech_config=speech_config, audio_config=audio_config
            )
            results = []
            done = False

            def stop_cb(_):
                nonlocal done
                done = True

            recognizer.recognized.connect(lambda e: results.append(e.result.text))
            recognizer.session_stopped.connect(stop_cb)
            recognizer.canceled.connect(stop_cb)
            recognizer.start_continuous_recognition()

            while not done:
                time.sleep(0.5)
            recognizer.stop_continuous_recognition()

            full_text = " ".join(results)
            return TranscriptionResult(
                text=full_text, segments=[],
                detected_language=language_hint or "en-NG",
                confidence=0.9, word_count=len(full_text.split()),
            )
        finally:
            os.unlink(tmp_path)


def get_transcription_service():
    providers = {
        "groq": GroqTranscriptionService,
        "azure": AzureTranscriptionService,
        "whisper": WhisperTranscriptionService,
    }
    cls = providers.get(settings.transcription_provider, WhisperTranscriptionService)
    return cls()
