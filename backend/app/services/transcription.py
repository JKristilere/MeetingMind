"""
Transcription service — supports two providers:
  - faster-whisper  (local, open source, zero per-call cost)
  - azure           (cloud, accurate for Nigerian accents with custom models)

Switch via TRANSCRIPTION_PROVIDER env var.
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


class WhisperTranscriptionService:
    """
    Local transcription using faster-whisper.
    Supports English, Nigerian Pidgin (as English), Yoruba, Igbo, Hausa.
    Whisper handles code-switching reasonably well by transcribing the
    dominant language while preserving mixed phrases.
    """

    _model = None  # Module-level singleton to avoid reloading per task

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
            kwargs = {"beam_size": 5, "vad_filter": True, "vad_parameters": {"min_silence_duration_ms": 500}}
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
    """Azure Speech-to-Text — use for better accuracy on Nigerian English if budget allows."""

    def transcribe(self, audio_bytes: bytes, language_hint: str | None = None) -> TranscriptionResult:
        import azure.cognitiveservices.speech as speechsdk
        import io

        speech_config = speechsdk.SpeechConfig(
            subscription=settings.azure_speech_key,
            region=settings.azure_speech_region,
        )
        speech_config.speech_recognition_language = language_hint or "en-NG"
        speech_config.enable_audio_logging()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(audio_bytes)
            tmp_path = tmp.name

        try:
            audio_config = speechsdk.AudioConfig(filename=tmp_path)
            recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

            results = []
            done = False

            def stop_cb(_):
                nonlocal done
                done = True

            recognizer.recognized.connect(lambda e: results.append(e.result.text))
            recognizer.session_stopped.connect(stop_cb)
            recognizer.canceled.connect(stop_cb)
            recognizer.start_continuous_recognition()

            import time
            while not done:
                time.sleep(0.5)
            recognizer.stop_continuous_recognition()

            full_text = " ".join(results)
            return TranscriptionResult(
                text=full_text,
                segments=[],
                detected_language=language_hint or "en-NG",
                confidence=0.9,
                word_count=len(full_text.split()),
            )
        finally:
            os.unlink(tmp_path)


def get_transcription_service():
    if settings.transcription_provider == "azure":
        return AzureTranscriptionService()
    return WhisperTranscriptionService()
