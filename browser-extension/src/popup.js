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

  // Lookup matching credentials
  const result = await sendMessage({ type: 'lookup', url: tab.url });

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
    item.innerHTML = `
      <span class="credential-icon">\uD83C\uDF10</span>
      <div class="credential-info">
        <div class="credential-name">${escapeHtml(cred.name)}</div>
        <div class="credential-username">Click to auto-fill</div>
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
    <div style="margin-bottom: 8px;">
      <label style="font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 4px;">Port</label>
      <input id="cfg-port" type="number" placeholder="e.g., 9876" style="width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; outline: none;">
    </div>
    <div style="margin-bottom: 8px;">
      <label style="font-size: 11px; color: rgba(255,255,255,0.4); display: block; margin-bottom: 4px;">Token</label>
      <input id="cfg-token" type="text" placeholder="Auth token from ~/.gila/bridge.token" style="width: 100%; padding: 6px 8px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; color: #fff; font-size: 12px; outline: none;">
    </div>
    <button id="cfg-save" style="width: 100%; padding: 8px; background: rgba(255,255,255,0.1); border: none; border-radius: 6px; color: #fff; font-size: 12px; cursor: pointer;">Connect</button>
    <p style="font-size: 10px; color: rgba(255,255,255,0.25); margin-top: 8px; text-align: center;">
      Find port in ~/.gila/bridge.port<br>and token in ~/.gila/bridge.token
    </p>
  `;
  credentialsEl.appendChild(settingsDiv);

  // Load existing values
  chrome.storage.local.get(['gilaPort', 'gilaToken'], (result) => {
    if (result.gilaPort) document.getElementById('cfg-port').value = result.gilaPort;
    if (result.gilaToken) document.getElementById('cfg-token').value = result.gilaToken;
  });

  document.getElementById('cfg-save').addEventListener('click', async () => {
    const port = document.getElementById('cfg-port').value;
    const token = document.getElementById('cfg-token').value;
    if (!port || !token) return;

    await sendMessage({ type: 'update_config', port: parseInt(port), token });
    showStatus('Connecting...', '');

    // Wait and retry
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
