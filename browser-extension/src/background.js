// Gila Browser Extension — Background Service Worker
// Bridge auto-discovers and auto-reconnects to Gila desktop app

import { GilaBridge } from './bridge.js';

const bridge = new GilaBridge();

// Start: discover and connect
bridge.discover();

// Auto-save: whenever ANY tab finishes loading, check if there's a pending credential
// and save it immediately — no prompts, no conditions
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;

  try {
    const data = await chrome.storage.session.get('pendingCredential');
    const cred = data?.pendingCredential;
    if (!cred || !cred.password) return;

    // Only process if less than 2 minutes old
    if (Date.now() - cred.timestamp > 120000) {
      chrome.storage.session.remove('pendingCredential');
      return;
    }

    // Wait for bridge to be connected
    if (!bridge.isConnected) {
      // Try to connect, will retry on next tab update
      bridge.discover();
      return;
    }

    console.log('[Gila] Auto-saving credential for', cred.username || cred.hostname);

    const result = await bridge.send({
      method: 'save_credential',
      name: cred.name,
      url: cred.url,
      username: cred.username,
      password: cred.password,
    });

    if (result?.result) {
      console.log('[Gila] Saved:', result.result.name, result.result.id);
    } else {
      console.log('[Gila] Save response:', result);
    }

    // Clear it immediately after saving
    chrome.storage.session.remove('pendingCredential');
  } catch (e) {
    console.log('[Gila] Error:', e);
  }
});

// Also check on a short interval in case tabs.onUpdated doesn't fire
setInterval(async () => {
  if (!bridge.isConnected) return;

  try {
    const data = await chrome.storage.session.get('pendingCredential');
    const cred = data?.pendingCredential;
    if (!cred || !cred.password) return;

    if (Date.now() - cred.timestamp > 120000) {
      chrome.storage.session.remove('pendingCredential');
      return;
    }

    // If credential has been sitting for more than 5 seconds, save it
    // (means the page already navigated)
    if (Date.now() - cred.timestamp > 5000) {
      console.log('[Gila] Interval: auto-saving credential for', cred.username || cred.hostname);

      const result = await bridge.send({
        method: 'save_credential',
        name: cred.name,
        url: cred.url,
        username: cred.username,
        password: cred.password,
      });

      if (result?.result) {
        console.log('[Gila] Saved:', result.result.name);
      }

      chrome.storage.session.remove('pendingCredential');
    }
  } catch {}
}, 3000);

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.type) {
    case 'bridge_status':
      sendResponse({ connected: bridge.isConnected });
      return true;

    case 'update_config':
      bridge.disconnect();
      bridge.saveConfig(request.port, request.token);
      bridge.connect();
      sendResponse({ ok: true });
      return true;

    case 'reconnect':
      bridge.disconnect();
      bridge.discover();
      sendResponse({ ok: true });
      return true;

    case 'lookup':
      bridge.send({
        method: 'lookup',
        url: request.url,
        username: request.username || undefined,
      }).then(sendResponse);
      return true;

    case 'get_credential':
      bridge.send({ method: 'get_credential', id: request.id }).then(sendResponse);
      return true;

    case 'save_credential':
      bridge.send({
        method: 'save_credential',
        name: request.name,
        url: request.url,
        username: request.username,
        password: request.password,
      }).then(sendResponse);
      return true;

    case 'bridge_send':
      bridge.send(request.payload).then(sendResponse);
      return true;

    case 'forms_detected':
      if (sender.tab?.id) {
        chrome.storage.session?.set?.({ [`forms_${sender.tab.id}`]: request });
      }
      sendResponse({ ok: true });
      return true;

    case 'pending_save':
      if (bridge.isConnected && request.password) {
        bridge.send({
          method: 'save_credential',
          name: request.name,
          url: request.url,
          username: request.username,
          password: request.password,
        });
      }
      sendResponse({ ok: true });
      return true;
  }
});
