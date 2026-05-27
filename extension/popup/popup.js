/**
 * MeetingMind Recorder — Popup Logic
 * ====================================
 *
 * The popup is a short-lived document (closes when you click outside it).
 * All durable state lives in chrome.storage.session / local and the background
 * service worker — we just read and render it here.
 *
 * State cards:
 *   #stateNotConfigured  → no serverUrl / accessToken / currentOrgId
 *   #stateNoMeeting      → configured but not on a Meet/Zoom tab
 *   #stateIdle           → on a meeting tab, ready to record
 *   #stateRecording      → actively recording (timer ticks)
 *   #stateUploading      → stopped, uploading to backend
 *   #stateDone           → upload complete
 *   #stateError          → any error
 */

'use strict';

// ── Helpers ───────────────────────────────────────────────────────────────────

const bg = (type, payload = {}) =>
  chrome.runtime.sendMessage({ type, ...payload });

function showOnly(id) {
  document.querySelectorAll('.state-card').forEach((el) => {
    el.classList.toggle('active', el.id === id);
  });
}

function fmt(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

let timerInterval = null;

function startTimer(startMs) {
  clearInterval(timerInterval);
  const el = document.getElementById('timerDisplay');
  const tick = () => {
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    el.textContent = fmt(elapsed);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
}

// ── Main render ───────────────────────────────────────────────────────────────

async function render() {
  // 1. Check configuration
  const { serverUrl, accessToken, currentOrgId } =
    await chrome.storage.local.get(['serverUrl', 'accessToken', 'currentOrgId']);

  if (!serverUrl || !accessToken || !currentOrgId) {
    showOnly('stateNotConfigured');
    return;
  }

  // 2. Check for a pending error from the last upload attempt
  const { lastError, lastMeetingId } =
    await chrome.storage.local.get(['lastError', 'lastMeetingId']);

  // 3. Get current state from service worker
  const { currentMeeting, recordingState } = await bg('GET_STATE').catch(() => ({
    currentMeeting:  null,
    recordingState: 'idle',
  }));

  // 4. Pick the right state card

  switch (recordingState) {

    case 'recording': {
      const { recordingStartTime, recordingTitle } =
        await chrome.storage.session.get(['recordingStartTime', 'recordingTitle']);

      document.getElementById('recMeetingName').textContent =
        recordingTitle || currentMeeting?.title || 'Recording…';
      document.getElementById('recPlatformChip').textContent =
        platformLabel(currentMeeting?.platform);

      if (recordingStartTime) startTimer(recordingStartTime);
      showOnly('stateRecording');
      break;
    }

    case 'uploading': {
      stopTimer();
      showOnly('stateUploading');
      break;
    }

    default: { // idle
      stopTimer();

      // Show done / error if we just finished an upload
      if (lastError) {
        document.getElementById('errorMessage').textContent = lastError;
        showOnly('stateError');
        break;
      }

      if (lastMeetingId) {
        showOnly('stateDone');
        break;
      }

      // Normal idle — show meeting card or no-meeting card
      if (currentMeeting) {
        document.getElementById('idleMeetingName').textContent = currentMeeting.title || 'Meeting';
        document.getElementById('idlePlatformChip').textContent = platformLabel(currentMeeting.platform);
        document.getElementById('titleInput').value = currentMeeting.title || '';
        showOnly('stateIdle');
      } else {
        showOnly('stateNoMeeting');
      }
      break;
    }
  }
}

function platformLabel(platform) {
  return platform === 'zoom' ? 'Zoom' : 'Meet';
}

// ── Button handlers ───────────────────────────────────────────────────────────

document.getElementById('settingsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('openOptionsBtn').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('startBtn').addEventListener('click', async () => {
  const title        = document.getElementById('titleInput').value.trim();
  const language     = document.getElementById('langSelect').value;
  const participants = document.getElementById('participantsInput').value.trim();
  const errEl        = document.getElementById('idleError');

  errEl.style.display = 'none';

  const res = await bg('START_RECORDING', { title, language, participants }).catch((e) => ({
    ok: false,
    error: e.message,
  }));

  if (!res.ok) {
    errEl.textContent    = res.error || 'Failed to start recording.';
    errEl.style.display  = 'block';
    return;
  }

  // Show recording state immediately (don't wait for render loop)
  showOnly('stateRecording');
  document.getElementById('recMeetingName').textContent = title || 'Meeting';

  const { recordingStartTime } = await chrome.storage.session.get(['recordingStartTime']);
  if (recordingStartTime) startTimer(recordingStartTime);
});

document.getElementById('stopBtn').addEventListener('click', async () => {
  stopTimer();
  showOnly('stateUploading');
  await bg('STOP_RECORDING').catch(() => {});
});

document.getElementById('retryBtn').addEventListener('click', async () => {
  // Clear the last error so we show the normal idle/no-meeting state
  await chrome.storage.local.remove(['lastError', 'lastMeetingId']);
  render();
});

document.getElementById('viewMeetingBtn').addEventListener('click', async () => {
  const { serverUrl, lastMeetingId } =
    await chrome.storage.local.get(['serverUrl', 'lastMeetingId']);
  if (serverUrl && lastMeetingId) {
    const url = `${serverUrl.replace(/\/$/, '')}/meetings/${lastMeetingId}`;
    chrome.tabs.create({ url });
    // Clear so we don't keep showing "done" forever
    await chrome.storage.local.remove(['lastMeetingId']);
  }
});

// ── Poll for state changes while popup is open ────────────────────────────────
// The popup is short-lived; a simple 500 ms poll is cheap and reliable.

render();
const pollId = setInterval(render, 800);
window.addEventListener('unload', () => clearInterval(pollId));
