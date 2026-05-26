/**
 * MeetingMind Recorder — Content Script
 * ======================================
 *
 * Injected into Google Meet and Zoom meeting pages.
 * Detects whether the current page is an *active* meeting and notifies the
 * background service worker so it can update the toolbar badge and populate
 * the popup's meeting title / platform fields.
 *
 * Detection heuristics
 * --------------------
 *  Google Meet  https://meet.google.com/abc-defg-hij
 *  Zoom web     https://app.zoom.us/wc/<meeting-id>/...
 *               https://<subdomain>.zoom.us/j/<meeting-id>
 */

(function () {
  'use strict';

  // ── Meeting detection ───────────────────────────────────────────────────────

  function detectMeeting() {
    const { hostname, pathname } = window.location;
    let platform  = null;
    let meetingId = null;
    let title     = document.title || '';

    if (hostname === 'meet.google.com') {
      // Active meeting URLs:  /abc-defg-hij  (3-4-3 letter code)
      // Lobby / other pages: /landing, /, /settings, etc.
      const m = pathname.match(/^\/([a-z][a-z0-9]{2,4}-[a-z0-9]{4}-[a-z][a-z0-9]{2,4})(\?.*)?$/i);
      if (m) {
        platform  = 'google_meet';
        meetingId = m[1];
        // Google Meet sets the title to the meeting name once you're inside
        title = document.title.replace(' - Google Meet', '').trim() || `Google Meet (${meetingId})`;
      }
    } else if (hostname.includes('zoom.us')) {
      // Web client: /wc/<meetingId>/... or /j/<meetingId>
      const m = pathname.match(/^\/(wc|j)\/(\d{9,11})/);
      if (m) {
        platform  = 'zoom';
        meetingId = m[2];
        title = document.title.replace(/\s*[-–|].*$/, '').trim() || `Zoom Meeting (${meetingId})`;
      }
    }

    if (platform) {
      chrome.runtime.sendMessage({
        type: 'MEETING_DETECTED',
        platform,
        meetingId,
        title,
        url: window.location.href,
      }).catch(() => {/* SW may not be ready yet */});
    } else {
      chrome.runtime.sendMessage({ type: 'MEETING_LEFT' }).catch(() => {});
    }
  }

  // ── Watch for SPA navigation and title changes ──────────────────────────────

  detectMeeting();

  // Re-detect when the page title changes (Meet updates it once you're live)
  const titleEl = document.querySelector('title');
  if (titleEl) {
    new MutationObserver(detectMeeting).observe(titleEl, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  // Re-detect on URL changes (both Meet and Zoom are SPAs)
  let lastHref = location.href;
  new MutationObserver(() => {
    if (location.href !== lastHref) {
      lastHref = location.href;
      detectMeeting();
    }
  }).observe(document.body, { subtree: true, childList: true });
})();
