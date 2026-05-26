/**
 * MeetingMind Recorder — Offscreen Document
 * ==========================================
 *
 * Why an offscreen document?
 * Chrome MV3 service workers cannot use `navigator.mediaDevices.getUserMedia`
 * or `MediaRecorder`. Offscreen documents are headless extension pages that CAN
 * use those Web APIs, while still being able to communicate with the service
 * worker via `chrome.runtime.sendMessage`.
 *
 * Flow
 * ----
 *   background SW sends  OFFSCREEN_START  → we start MediaRecorder
 *   background SW sends  OFFSCREEN_STOP   → we stop MediaRecorder
 *   MediaRecorder.onstop fires            → we base64-encode the Blob
 *                                         → we send  AUDIO_READY  back to SW
 *   SW uploads the audio and closes this document.
 *
 * Audio size estimate
 * -------------------
 *   audio/webm;codecs=opus at ~32 kbps:
 *     30 min  →  ~7 MB  (base64 ≈ 9.5 MB)
 *     60 min  → ~14 MB  (base64 ≈ 19 MB)
 *     120 min → ~28 MB  (base64 ≈ 38 MB)
 *   chrome.runtime.sendMessage limit is ~64 MB, so ~2.5 hours is safe.
 */

'use strict';

let mediaRecorder = null;
let audioChunks   = [];
let captureStream = null;

// ── Message listener ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.target !== 'offscreen') return false;

  switch (msg.type) {
    case 'OFFSCREEN_START':
      startCapture(msg).then(sendResponse).catch((err) => {
        sendResponse({ ok: false, error: err.message });
        notifyError(err.message);
      });
      return true; // async

    case 'OFFSCREEN_STOP':
      stopCapture();
      sendResponse({ ok: true });
      return false;
  }

  return false;
});


// ── Start capture ─────────────────────────────────────────────────────────────

async function startCapture({ streamId }) {
  audioChunks   = [];
  captureStream = null;

  // Use the stream ID obtained by chrome.tabCapture.getMediaStreamId in the SW.
  // The mandatory chromeMediaSource constraints tell Chrome to give us tab audio.
  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource:   'tab',
        chromeMediaSourceId: streamId,
      },
    },
    video: false,
  });

  // Choose the best supported audio format (Opus in WebM is ideal — small and
  // high quality; fall back to plain WebM if the browser doesn't advertise Opus).
  const mimeType = pickMimeType();

  mediaRecorder = new MediaRecorder(captureStream, { mimeType });

  mediaRecorder.ondataavailable = (e) => {
    if (e.data?.size > 0) audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => {
    finaliseRecording(mimeType);
    releaseStream();
  };

  mediaRecorder.onerror = (e) => {
    const msg = e.error?.message || 'MediaRecorder error';
    notifyError(msg);
    releaseStream();
  };

  // Slice every 30 s so we accumulate chunks even if onstop is never called.
  mediaRecorder.start(30_000);

  return { ok: true };
}


// ── Stop capture ──────────────────────────────────────────────────────────────

function stopCapture() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop(); // fires onstop → finaliseRecording
  } else {
    releaseStream();
  }
}


// ── Finalise ──────────────────────────────────────────────────────────────────

function finaliseRecording(mimeType) {
  if (audioChunks.length === 0) {
    notifyError('No audio data was captured.');
    return;
  }

  const blob = new Blob(audioChunks, { type: mimeType });

  // Convert to base64 so we can send it across the chrome.runtime.sendMessage
  // boundary (which uses structured-clone — ArrayBuffer is cloneable but Blob
  // is not transferable; base64 string is the most reliable approach).
  const reader = new FileReader();
  reader.onload = () => {
    // reader.result is  "data:<mimeType>;base64,<data>"
    const base64 = reader.result.split(',')[1];
    chrome.runtime.sendMessage({
      type:        'AUDIO_READY',
      audioBase64: base64,
      mimeType,
    }).catch(() => {/* SW may have been killed; it will handle the missing data */});
  };
  reader.onerror = () => notifyError('Failed to read recorded audio.');
  reader.readAsDataURL(blob);
}


// ── Helpers ───────────────────────────────────────────────────────────────────

function releaseStream() {
  if (captureStream) {
    captureStream.getTracks().forEach((t) => t.stop());
    captureStream = null;
  }
}

function notifyError(error) {
  chrome.runtime.sendMessage({ type: 'RECORDING_ERROR', error }).catch(() => {});
}

function pickMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/ogg',
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? 'audio/webm';
}
