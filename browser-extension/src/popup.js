// Gila Browser Extension — Popup Script
// Shows matching credentials for the current site

const statusEl = document.getElementById('status');
const credentialsEl = document.getElementById('credentials');
const emptyEl = document.getElementById('empty');

async function init() {
  // Check bridge connection
  const bridgeStatus = await sendMessage({ type: 'bridge_status' });

  if (!bridgeStatus?.connected) {
    showStatus('Not connected — open Gila desktop app', 'error');
    showSettings();
    return;
  }

  showStatus('Connected to Gila', 'connected');

  // Get the current tab's URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) {
    showEmpty('No active page');
    return;
  }

  // Ask the content script for any detected username on the page
  let detectedUsername = '';
  try {
    const formInfo = await new Promise((resolve) => {
      chrome.tabs.sendMessage(tab.id, { type: 'get_form_values' }, resolve);
    });
    detectedUsername = formInfo?.username || '';
  } catch {}

  // Lookup matching credentials, passing detected username for filtering
  const result = await sendMessage({ type: 'lookup', url: tab.url, username: detectedUsername });

  if (result?.error === 'vault_locked') {
    showStatus('Vault is locked — unlock in Gila', 'error');
    return;
  }

  if (result?.error) {
    showStatus(`Error: ${result.error}`, 'error');
    return;
  }

  const credentials = result?.result || [];

  if (credentials.length === 0) {
    showEmpty('No credentials for this site');
    return;
  }

  renderCredentials(credentials, tab.id);
}

function renderCredentials(credentials, tabId) {
  credentialsEl.innerHTML = '';
  emptyEl.style.display = 'none';

  for (const cred of credentials) {
    const item = document.createElement('div');
    item.className = 'credential-item';
    const displayName = cred.username || cred.name;
    const subtitle = cred.username ? cred.name : 'Click to auto-fill';
    item.innerHTML = `
      <span class="credential-icon">\uD83C\uDF10</span>
      <div class="credential-info">
        <div class="credential-name">${escapeHtml(displayName)}</div>
        <div class="credential-username">${escapeHtml(subtitle)}</div>
      </div>
    `;
    item.addEventListener('click', () => fillCredential(cred.id, tabId));
    credentialsEl.appendChild(item);
  }
}

async function fillCredential(credId, tabId) {
  // Fetch full credential data (decrypted)
  const result = await sendMessage({ type: 'get_credential', id: credId });

  if (result?.error) {
    showStatus(`Error: ${result.error}`, 'error');
    return;
  }

  const data = result?.result?.data;
  if (!data) return;

  // Send fill command to content script
  chrome.tabs.sendMessage(tabId, {
    type: 'fill_credential',
    username: data.username || data.email || '',
    password: data.password || '',
  });

  // Close popup
  window.close();
}

function showStatus(text, type) {
  statusEl.textContent = text;
  statusEl.className = `status ${type || ''}`;
}

function showEmpty(text) {
  emptyEl.querySelector('p').textContent = text;
  emptyEl.style.display = 'block';
}

function showSettings() {
  const settingsDiv = document.createElement('div');
  settingsDiv.style.cssText = 'padding: 12px 0;';
  settingsDiv.innerHTML = `
    <button id="cfg-reconnect" style="width: 100%; padding: 10px; background: rgba(74, 222, 128, 0.12); border: 1px solid rgba(74, 222, 128, 0.25); border-radius: 8px; color: #4ade80; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 12px;">
      Reconnect to Gila
    </button>
    <p style="font-size: 11px; color: rgba(255,255,255,0.35); text-align: center; margin-bottom: 16px;">
      Make sure the Gila desktop app is running
    </p>
    <p id="ext-id-display" style="font-size: 10px; color: rgba(255,255,255,0.2); text-align: center; margin-bottom: 12px; font-family: monospace;"></p>
    <details style="margin-top: 4px;">
      <summary style="font-size: 11px; color: rgba(255,255,255,0.3); cursor: pointer; margin-bottom: 8px;">
        Manual connection setup
      </summary>
      <div style="margin-top: 8px;">
        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 4px;">Port</label>
          <input id="cfg-port" type="number" placeholder="e.g., 9876" style="width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; outline: none;">
        </div>
        <div style="margin-bottom: 8px;">
          <label style="font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 4px;">Token</label>
          <input id="cfg-token" type="text" placeholder="Auth token" style="width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; outline: none;">
        </div>
        <button id="cfg-save" style="width: 100%; padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; font-size: 12px; cursor: pointer;">Save & Connect</button>
      </div>
    </details>
  `;
  credentialsEl.appendChild(settingsDiv);

  // Show extension ID for native host setup
  const extIdEl = document.getElementById('ext-id-display');
  if (extIdEl) {
    extIdEl.textContent = `Extension ID: ${chrome.runtime.id}`;
  }

  // Reconnect button triggers auto-discovery via native messaging
  document.getElementById('cfg-reconnect').addEventListener('click', async () => {
    showStatus('Reconnecting...', '');
    await sendMessage({ type: 'reconnect' });
    setTimeout(init, 2000);
  });

  // Manual config fallback
  chrome.storage.local.get(['gilaPort', 'gilaToken'], (result) => {
    const portEl = document.getElementById('cfg-port');
    const tokenEl = document.getElementById('cfg-token');
    if (portEl && result.gilaPort) portEl.value = result.gilaPort;
    if (tokenEl && result.gilaToken) tokenEl.value = result.gilaToken;
  });

  document.getElementById('cfg-save')?.addEventListener('click', async () => {
    const port = document.getElementById('cfg-port').value;
    const token = document.getElementById('cfg-token').value;
    if (!port || !token) return;

    await sendMessage({ type: 'update_config', port: parseInt(port), token });
    showStatus('Connecting...', '');
    setTimeout(init, 1500);
  });
}

function sendMessage(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, resolve);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

init();
