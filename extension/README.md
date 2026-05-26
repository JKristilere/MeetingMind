# MeetingMind Recorder — Chrome Extension

A **Manifest V3** Chrome extension that captures audio from your **Google Meet** or **Zoom** browser tab and sends it to your MeetingMind workspace for AI transcription and analysis — **entirely free, zero third-party services**.

---

## How it works

```
User clicks "Start Recording"
        │
        ▼
background.js  ──getMediaStreamId──►  Chrome tab audio stream ID
        │
        ▼
offscreen.js   ──getUserMedia───────►  MediaStream (tab audio)
               ──MediaRecorder──────►  audio/webm;codecs=opus chunks
        │  (user clicks Stop)
        ▼
offscreen.js assembles Blob → base64 → background.js
        │
        ▼
background.js  ──FormData POST──────►  /api/v1/meetings/{org_id}/meetings
        │
        ▼
Existing Celery pipeline:
  Transcribe (Whisper) → AI Analysis → Notify (WhatsApp + email)
```

---

## File structure

```
extension/
├── manifest.json          MV3 manifest
├── background.js          Service worker: state machine, tab capture, upload
├── content/
│   └── content.js         Injected into Meet/Zoom — detects active meeting
├── offscreen/
│   ├── offscreen.html
│   └── offscreen.js       MediaRecorder in a headless extension page
├── popup/
│   ├── popup.html         Start/Stop/Timer UI
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html       Server URL + login + workspace selector
│   ├── options.js
│   └── options.css
└── icons/
    └── icon.svg           Source icon (convert to PNG to add to manifest)
```

---

## Installation (developer mode)

1. **Generate PNG icons** from the SVG source (optional but recommended):

   ```bash
   # Requires Inkscape or ImageMagick
   inkscape -w 16  -h 16  icons/icon.svg -o icons/icon16.png
   inkscape -w 48  -h 48  icons/icon.svg -o icons/icon48.png
   inkscape -w 128 -h 128 icons/icon.svg -o icons/icon128.png
   ```

   Then uncomment the `icons` and `action.default_icon` blocks in `manifest.json`.

2. Open Chrome and navigate to `chrome://extensions`

3. Enable **Developer mode** (top-right toggle)

4. Click **Load unpacked** and select this `extension/` folder

5. The MeetingMind Recorder icon appears in your toolbar

---

## First-time setup

1. Click the extension icon → **⚙ Open Settings** (or right-click → Options)

2. Enter your **Server URL**:
   - Local dev: `http://localhost`
   - Production: `https://meetingmind.yourcompany.com`

3. Log in with your MeetingMind email and password

4. Select your **workspace** from the dropdown

5. Click **Save Settings**

---

## Recording a meeting

1. Open a **Google Meet** or **Zoom** meeting in Chrome

2. Click the MeetingMind extension icon — you'll see the meeting name auto-detected

3. (Optional) Edit the meeting title and select a language

4. Click **▶ Start Recording**
   - The toolbar badge turns red and shows `REC`
   - Audio from the tab is captured (participants on your call can't hear this)

5. When the meeting ends, click **⬛ Stop & Upload**
   - The recording is uploaded to your MeetingMind backend
   - The existing pipeline runs: Whisper transcription → AI analysis → WhatsApp/email delivery

6. Click **View Meeting →** to open the results in your dashboard

---

## Backend configuration

The extension uploads to the same `POST /api/v1/meetings/{org_id}/meetings` endpoint used by the web app.  No new backend routes are needed.

### CORS (for production deployments)

Chrome extension service workers bypass CORS when they have `<all_urls>` `host_permissions`, so **no CORS changes are needed on the backend** for service worker requests.

If you run into CORS issues in a non-standard setup, add this to your `.env`:

```env
CORS_EXTRA_ORIGINS=["*"]
```

This adds `*` to the backend's allowed origins. JWT auth still protects all endpoints.

---

## Supported platforms

| Platform    | Detection | Audio capture |
|-------------|-----------|---------------|
| Google Meet | ✅ Auto   | ✅ Tab audio  |
| Zoom (web)  | ✅ Auto   | ✅ Tab audio  |
| Zoom (desktop app) | ❌ | ❌ (use Zoom webhook integration instead) |

> **Note:** The Zoom *desktop app* runs outside the browser. For desktop Zoom, use the **Zoom Cloud Recording webhook integration** (`Settings → Integrations`).

---

## Audio format & size limits

| Format | Bitrate | 1-hour file | 2-hour file |
|--------|---------|-------------|-------------|
| audio/webm;codecs=opus | ~32 kbps | ~14 MB | ~28 MB |

Chrome's internal message limit is ~64 MB (base64 overhead ≈ 1.33×), so recordings up to **~2.5 hours** are supported. Longer meetings should use the Zoom webhook integration.

---

## Permissions explained

| Permission | Why |
|------------|-----|
| `tabCapture` | Capture audio from the active tab |
| `offscreen` | Run MediaRecorder in a headless extension page (MV3 service workers can't use Web APIs) |
| `storage` | Persist server URL, tokens, and recording state |
| `activeTab` | Get the current tab's ID for capture |
| `tabs` | Open the meeting detail page after upload |
| `<all_urls>` | Upload to any user-configured MeetingMind server URL |

---

## Troubleshooting

**"Not configured. Open extension options first."**
→ Open the options page, enter your server URL and log in.

**"No active tab found."**
→ The meeting tab must be the *active* (focused) tab when you click Start.

**"Failed to start recording" / MediaRecorder errors**
→ Ensure the tab has audio playing. Zoom/Meet must have joined with audio.

**Recording interrupted (extension restarted)**
→ Chrome occasionally restarts service workers. If this happens, re-record from the beginning. The partial recording is discarded.

**Upload fails with 401**
→ Your session expired. Open Options and log in again.
