/**
 * MeetingMind Recorder — Options Page Logic
 * ==========================================
 *
 * Manages:
 *   - Server URL input
 *   - Login / logout (calls backend /auth/login)
 *   - Workspace (org) selector (calls backend /organisations)
 *   - Persists everything to chrome.storage.local
 *
 * chrome.storage.local keys used
 * --------------------------------
 *   serverUrl      — base URL of the MeetingMind backend
 *   accessToken    — JWT access token
 *   refreshToken   — JWT refresh token
 *   currentOrgId   — UUID of the selected organisation
 *   currentUser    — { full_name, email } snapshot
 */

'use strict';

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $serverUrl    = document.getElementById('serverUrl');
const $email        = document.getElementById('email');
const $password     = document.getElementById('password');
const $loginBtn     = document.getElementById('loginBtn');
const $loginBtnText = document.getElementById('loginBtnText');
const $loginAlert   = document.getElementById('loginAlert');
const $loginView    = document.getElementById('loginView');
const $loggedInView = document.getElementById('loggedInView');
const $userAvatar   = document.getElementById('userAvatar');
const $userName     = document.getElementById('userName');
const $userEmail    = document.getElementById('userEmail');
const $logoutBtn    = document.getElementById('logoutBtn');
const $workspaceCard = document.getElementById('workspaceCard');
const $orgSelect    = document.getElementById('orgSelect');
const $saveBtn      = document.getElementById('saveBtn');
const $saveAlert    = document.getElementById('saveAlert');


// ── Utility ───────────────────────────────────────────────────────────────────

function showAlert(el, msg, type = 'error') {
  el.textContent = msg;
  el.className   = `alert alert-${type}`;
  el.classList.remove('hidden');
}

function hideAlert(el) {
  el.classList.add('hidden');
}

function apiUrl(path) {
  const base = $serverUrl.value.trim().replace(/\/$/, '');
  return `${base}/api/v1${path}`;
}


// ── Load saved state ──────────────────────────────────────────────────────────

async function loadState() {
  const stored = await chrome.storage.local.get([
    'serverUrl', 'accessToken', 'currentOrgId', 'currentUser',
  ]);

  if (stored.serverUrl) $serverUrl.value = stored.serverUrl;

  if (stored.accessToken && stored.currentUser) {
    showLoggedIn(stored.currentUser);
    if (stored.currentOrgId) loadOrgs(stored.accessToken, stored.currentOrgId);
  }
}


// ── Logged-in / logged-out views ──────────────────────────────────────────────

function showLoggedIn(user) {
  $loggedInView.classList.remove('hidden');
  $loginView.classList.add('hidden');
  $workspaceCard.style.display = '';

  $userName.textContent  = user.full_name || 'User';
  $userEmail.textContent = user.email     || '';
  $userAvatar.textContent = (user.full_name || 'U')[0].toUpperCase();
}

function showLoggedOut() {
  $loggedInView.classList.add('hidden');
  $loginView.classList.remove('hidden');
  $workspaceCard.style.display = 'none';
  $orgSelect.innerHTML = '<option value="">— loading —</option>';
}


// ── Load organisations ────────────────────────────────────────────────────────

async function loadOrgs(accessToken, selectedOrgId) {
  try {
    const res = await fetch(apiUrl('/organisations'), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const orgs = await res.json();

    $orgSelect.innerHTML = orgs
      .map(
        (o) =>
          `<option value="${o.id}" ${o.id === selectedOrgId ? 'selected' : ''}>${o.name}</option>`
      )
      .join('');

    if (!selectedOrgId && orgs.length > 0) {
      $orgSelect.value = orgs[0].id;
    }
  } catch (e) {
    $orgSelect.innerHTML = '<option value="">— failed to load —</option>';
  }
}


// ── Login ─────────────────────────────────────────────────────────────────────

$loginBtn.addEventListener('click', async () => {
  hideAlert($loginAlert);
  const serverUrl = $serverUrl.value.trim();
  const email     = $email.value.trim();
  const password  = $password.value;

  if (!serverUrl) { showAlert($loginAlert, 'Enter a server URL first.'); return; }
  if (!email)     { showAlert($loginAlert, 'Enter your email.');          return; }
  if (!password)  { showAlert($loginAlert, 'Enter your password.');       return; }

  $loginBtnText.textContent = 'Logging in…';
  $loginBtn.disabled = true;

  try {
    // Save the URL first so apiUrl() uses the right base
    await chrome.storage.local.set({ serverUrl });

    const res = await fetch(apiUrl('/auth/login'), {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.detail || `Login failed (${res.status})`);
    }

    const tokens = await res.json();

    // Fetch user profile
    const meRes = await fetch(apiUrl('/users/me'), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = meRes.ok ? await meRes.json() : { full_name: email, email };

    await chrome.storage.local.set({
      serverUrl,
      accessToken:   tokens.access_token,
      refreshToken:  tokens.refresh_token,
      currentUser:   { full_name: user.full_name, email: user.email },
      currentOrgId:  null, // will be set when user picks workspace
    });

    showLoggedIn(user);
    loadOrgs(tokens.access_token, null);

  } catch (err) {
    showAlert($loginAlert, err.message);
  } finally {
    $loginBtnText.textContent = 'Log in';
    $loginBtn.disabled = false;
  }
});

// Allow Enter key to submit
[$email, $password].forEach((el) =>
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') $loginBtn.click(); })
);


// ── Logout ────────────────────────────────────────────────────────────────────

$logoutBtn.addEventListener('click', async () => {
  await chrome.storage.local.remove([
    'accessToken', 'refreshToken', 'currentOrgId', 'currentUser',
  ]);
  $email.value    = '';
  $password.value = '';
  showLoggedOut();
});


// ── Save workspace selection ──────────────────────────────────────────────────

$saveBtn.addEventListener('click', async () => {
  const orgId     = $orgSelect.value;
  const serverUrl = $serverUrl.value.trim();

  if (!orgId)     { showAlert($saveAlert, 'Select a workspace.');   return; }
  if (!serverUrl) { showAlert($saveAlert, 'Enter a server URL.');   return; }

  await chrome.storage.local.set({ currentOrgId: orgId, serverUrl });

  showAlert($saveAlert, 'Settings saved!', 'success');
  setTimeout(() => hideAlert($saveAlert), 3000);
});


// ── Server URL — blur to refresh orgs ────────────────────────────────────────

$serverUrl.addEventListener('blur', async () => {
  const { accessToken, currentOrgId } =
    await chrome.storage.local.get(['accessToken', 'currentOrgId']);
  if (accessToken) loadOrgs(accessToken, currentOrgId);
});


// ── Init ──────────────────────────────────────────────────────────────────────

loadState();
