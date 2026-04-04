// Gila Browser Extension — Background Service Worker
// Auto-discovers bridge via HTTP endpoint on fixed port 21525

import { GilaBridge } from './bridge.js';

const DISCOVERY_URL = 'http://127.0.0.1:21525/config';
const bridge = new GilaBridge();

async function autoConnect() {
  const discovered = await discoverBridge();
  if (discovered) return;

  // Fallback: try saved config
  await bridge.loadConfig();
  if (bridge.port && bridge.token) {
    bridge.connect();
  }
}

async function discoverBridge() {
  try {
    const res = await fetch(DISCOVERY_URL);
    if (!res.ok) return false;

    const config = await res.json();
    if (config.port && config.token) {
      console.log('[Gila] Auto-discovered bridge — port:', config.port);
      bridge.disconnect();
      bridge.saveConfig(config.port, config.token);
      bridge.connect();
      return true;
    }
  } catch {
    // Gila desktop app is not running
  }
  return false;
}

// Re-discover every 15 seconds if disconnected
setInterval(async () => {
  if (!bridge.isConnected) {
    await discoverBridge();
  }
}, 15000);

autoConnect();

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
      bridge.saveConfig(null, null);
      discoverBridge().then((ok) => {
        if (!ok) console.log('[Gila] Reconnect failed. Is Gila desktop app running?');
      });
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
      // Credential captured before page navigation — save it directly if connected
      if (bridge.isConnected && request.password) {
        bridge.send({
          method: 'save_credential',
          name: request.name,
          url: request.url,
          username: request.username,
          password: request.password,
        }).then((result) => {
          if (result?.result) {
            console.log('[Gila] Auto-saved credential from page navigation:', request.name);
          }
        });
      }
      sendResponse({ ok: true });
      return true;
  }
});
