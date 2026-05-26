/**
 * MeetingMind Recorder — Background Service Worker
 * =================================================
 *
 * State machine
 * -------------
 *   idle  ──START──►  recording  ──STOP──►  uploading  ──done──►  idle
 *                                                       ──error──► idle
 *
 * Message routing
 * ---------------
 *   content  → background : MEETING_DETECTED | MEETING_LEFT
 *   popup    → background : GET_STATE | START_RECORDING | STOP_RECORDING
 *   offscreen→ background : AUDIO_READY | RECORDING_ERROR
 *   background→ offscreen : OFFSCREEN_START | OFFSCREEN_STOP
 *
 * Why service worker does the upload (not offscreen)
 * ---------------------------------------------------
 * Chrome MV3 service workers bypass CORS for URLs covered by host_permissions,
 * so the backend needs no special CORS configuration for extension requests.
 * Offscreen documents are web pages and DO need CORS headers.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const OFFSCREEN_URL = chrome.runtime.getURL('offscreen/offscreen.html');

// Badge colours
const BADGE = {
  MEETING:   { text: '●',   color: '#10b981' },  // green dot — on a meeting page
  RECORDING: { text: 'REC', color: '#ef4444' },  // red — actively recording
  UPLOADING: { text: '↑',   color: '#6366f1' },  // violet — uploading
  DONE:      { text: '✓',   color: '#10b981' },  // green check — success
  ERROR:     { text: '!',   color: '#ef4444' },  // red bang — error
  IDLE:      { text: '',    color: '#6b7280' },  // no badge
};


// ── In-memory state (persisted to chrome.storage.session for popup reads) ─────

let currentMeeting = null;   // { platform, meetingId, title, url }
let recordingState = 'idle'; // idle | recording | uploading

async function saveState() {
  await chrome.storage.session.set({ recordingState, currentMeeting });
}


// ── Badge helpers ─────────────────────────────────────────────────────────────

function setBadge({ text, color }) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: '' });
}


// ── Offscreen document ────────────────────────────────────────────────────────

async function ensureOffscreen() {
  const exists = await chrome.offscreen.hasDocument();
  if (!exists) {
    await chrome.offscreen.createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: 'Capture tab audio for meeting recording',
    });
  }
}

async function closeOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.closeDocument();
    }
  } catch (_) { /* already closed */ }
}

function msgOffscreen(payload) {
  return chrome.runtime.sendMessage({ ...payload, target: 'offscreen' });
}


// ── Upload helpers ────────────────────────────────────────────────────────────

/**
 * Convert a base64 string + mimeType back to a Blob.
 * The service worker can't use `new File()`, but it CAN use `new Blob()`.
 */
function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

/**
 * Upload the assembled audio blob to MeetingMind.
 * Returns the created meeting object.
 * @param {string} participantNames  Comma-separated participant names (may be empty string).
 */
async function uploadToMeetingMind(base64Audio, mimeType, title, language, participantNames) {
  const { serverUrl, accessToken, currentOrgId } =
    await chrome.storage.local.get(['serverUrl', 'accessToken', 'currentOrgId']);

  if (!serverUrl || !accessToken || !currentOrgId) {
    throw new Error(
      'Extension not configured. Open extension options (⚙) to log in to MeetingMind.'
    );
  }

  const ext      = mimeType.includes('webm') ? 'webm' : 'ogg';
  const safeName = (title || 'meeting').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
  const filename = `${safeName}.${ext}`;

  const audioBlob = base64ToBlob(base64Audio, mimeType);
  const formData  = new FormData();
  formData.append('file',     audioBlob, filename);
  formData.append('title',    title    || 'Meeting Recording');
  formData.append('language', language || 'auto');
  if (participantNames && participantNames.trim()) {
    formData.append('participant_names', participantNames.trim());
  }

  const url = `${serverUrl.replace(/\/$/, '')}/api/v1/meetings/${currentOrgId}/meetings`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body:    formData,
  });

  if (res.status === 401) {
    // Try token refresh
    const { refreshToken } = await chrome.storage.local.get(['refreshToken']);
    if (refreshToken) {
      const refreshRes = await fetch(
        `${serverUrl.replace(/\/$/, '')}/api/v1/auth/refresh`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ refresh_token: refreshToken }),
        }
      );
      if (refreshRes.ok) {
        const tokens = await refreshRes.json();
        await chrome.storage.local.set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token });
        // Retry with new token
        const retry = await fetch(url, {
          method:  'POST',
          headers: { Authorization: `Bearer ${tokens.access_token}` },
          body:    formData,
        });
        if (!retry.ok) {
          const err = await retry.json().catch(() => ({}));
          throw new Error(err.detail || `Upload failed (${retry.status})`);
        }
        return retry.json();
      }
    }
    throw new Error('Session expired. Please log in again in extension options.');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || `Upload failed (${res.status})`);
  }

  return res.json();
}


// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // Guard: ignore messages intended for offscreen
  if (msg.target === 'offscreen') return false;

  switch (msg.type) {

    // ── From content scripts ──────────────────────────────────────────────────
    case 'MEETING_DETECTED': {
      currentMeeting = {
        platform:  msg.platform,
        meetingId: msg.meetingId,
        title:     msg.title,
        url:       msg.url,
      };
      if (recordingState === 'idle') setBadge(BADGE.MEETING);
      saveState();
      sendResponse({ ok: true });
      break;
    }

    case 'MEETING_LEFT': {
      if (recordingState === 'idle') {
        currentMeeting = null;
        clearBadge();
        saveState();
      }
      sendResponse({ ok: true });
      break;
    }

    // ── From popup ────────────────────────────────────────────────────────────
    case 'GET_STATE': {
      sendResponse({ currentMeeting, recordingState });
      break;
    }

    case 'START_RECORDING': {
      handleStartRecording(msg).then(sendResponse).catch((err) =>
        sendResponse({ ok: false, error: err.message })
      );
      return true; // async
    }

    case 'STOP_RECORDING': {
      handleStopRecording().then(sendResponse).catch((err) =>
        sendResponse({ ok: false, error: err.message })
      );
      return true; // async
    }

    // ── From offscreen ────────────────────────────────────────────────────────
    case 'AUDIO_READY': {
      handleAudioReady(msg).then(sendResponse).catch((err) =>
        sendResponse({ ok: false, error: err.message })
      );
      return true; // async
    }

    case 'RECORDING_ERROR': {
      recordingState = 'idle';
      setBadge(BADGE.ERROR);
      setTimeout(clearBadge, 4000);
      chrome.storage.local.set({ lastError: msg.error });
      saveState();
      closeOffscreen();
      sendResponse({ ok: true });
      break;
    }
  }

  return false;
});


// ── Handler: start recording ──────────────────────────────────────────────────

async function handleStartRecording(msg) {
  // Verify user is configured before we touch the mic
  const { serverUrl, accessToken, currentOrgId } =
    await chrome.storage.local.get(['serverUrl', 'accessToken', 'currentOrgId']);
  if (!serverUrl || !accessToken || !currentOrgId) {
    return { ok: false, error: 'Not configured. Open extension options first.' };
  }

  // Get the active tab
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return { ok: false, error: 'No active tab found.' };

  // Grab a stream ID for that tab (must be called from a user-gesture context;
  // clicking the popup "Start" button qualifies)
  const streamId = await new Promise((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(id);
    });
  });

  await ensureOffscreen();

  await msgOffscreen({
    type:     'OFFSCREEN_START',
    streamId,
    title:    msg.title    || currentMeeting?.title    || 'Meeting Recording',
    language: msg.language || 'auto',
  });

  recordingState = 'recording';
  setBadge(BADGE.RECORDING);

  // Persist start time for the popup timer
  await chrome.storage.session.set({
    recordingStartTime:    Date.now(),
    recordingTitle:        msg.title        || currentMeeting?.title || 'Meeting Recording',
    recordingLanguage:     msg.language     || 'auto',
    recordingParticipants: msg.participants || '',
  });
  await saveState();

  return { ok: true };
}


// ── Handler: stop recording ───────────────────────────────────────────────────

async function handleStopRecording() {
  if (recordingState !== 'recording') return { ok: false, error: 'Not recording.' };

  await msgOffscreen({ type: 'OFFSCREEN_STOP' });
  recordingState = 'uploading';
  setBadge(BADGE.UPLOADING);
  await saveState();

  return { ok: true };
}


// ── Handler: audio ready (from offscreen after stop) ─────────────────────────

async function handleAudioReady(msg) {
  // msg = { type, audioBase64, mimeType }
  const { recordingTitle, recordingLanguage, recordingParticipants } =
    await chrome.storage.session.get(['recordingTitle', 'recordingLanguage', 'recordingParticipants']);

  try {
    const meeting = await uploadToMeetingMind(
      msg.audioBase64,
      msg.mimeType,
      recordingTitle    || 'Meeting Recording',
      recordingLanguage || 'auto',
      recordingParticipants || '',
    );

    await chrome.storage.local.set({ lastMeetingId: meeting.id, lastError: null });
    recordingState = 'idle';
    setBadge(BADGE.DONE);
    setTimeout(() => {
      if (currentMeeting) setBadge(BADGE.MEETING);
      else clearBadge();
    }, 4000);

  } catch (err) {
    await chrome.storage.local.set({ lastError: err.message });
    recordingState = 'idle';
    setBadge(BADGE.ERROR);
    setTimeout(() => {
      if (currentMeeting) setBadge(BADGE.MEETING);
      else clearBadge();
    }, 5000);
  } finally {
    await saveState();
    await chrome.storage.session.set({ recordingStartTime: null, recordingParticipants: '' });
    await closeOffscreen();
  }

  return { ok: true };
}


// ── Restore state on SW restart ───────────────────────────────────────────────
// Service workers can be killed and restarted at any time. Restore in-memory
// state from session storage so the popup always shows the right thing.

(async () => {
  const stored = await chrome.storage.session.get(['recordingState', 'currentMeeting']);
  if (stored.recordingState) recordingState = stored.recordingState;
  if (stored.currentMeeting) currentMeeting = stored.currentMeeting;

  // If we were recording/uploading when the SW was killed, reset to idle so
  // the user gets a clear "something went wrong" state rather than a stuck UI.
  if (recordingState === 'recording' || recordingState === 'uploading') {
    recordingState = 'idle';
    setBadge(BADGE.ERROR);
    await chrome.storage.local.set({ lastError: 'Recording interrupted (extension restarted). Please try again.' });
    await saveState();
    await closeOffscreen();
  } else if (currentMeeting) {
    setBadge(BADGE.MEETING);
  }
})();
