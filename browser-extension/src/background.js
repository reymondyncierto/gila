// Gila Browser Extension — Background Service Worker
// Hub for WebSocket bridge and message routing
// Auto-discovers bridge connection via Native Messaging or file-based config

import { GilaBridge } from './bridge.js';

const NATIVE_HOST_NAME = 'com.rpyncierto.gila';
const bridge = new GilaBridge();

// Auto-discover bridge config on startup
async function autoConnect() {
  // Always try native messaging first to get fresh config
  const discovered = await discoverViaNativeMessaging();

  if (discovered) return; // Connected via native messaging

  // Fallback: try saved config (may be stale)
  await bridge.loadConfig();
  if (bridge.port && bridge.token) {
    bridge.connect();
    // If stale config fails, clear it
    setTimeout(() => {
      if (!bridge.isConnected) {
        console.log('[Gila] Saved config is stale, clearing.');
        bridge.saveConfig(null, null);
      }
    }, 3000);
  }
}

function discoverViaNativeMessaging() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(
        NATIVE_HOST_NAME,
        { action: 'get_config' },
        (response) => {
          const err = chrome.runtime.lastError;
          if (err) {
            console.log('[Gila] Native messaging not available:', err.message);
            resolve(false);
            return;
          }

          if (response && response.port && response.token) {
            console.log('[Gila] Auto-discovered bridge — port:', response.port);
            bridge.disconnect();
            bridge.saveConfig(response.port, response.token);
            bridge.connect();
            resolve(true);
          } else if (response?.error) {
            console.warn('[Gila] Native host:', response.message || response.error);
            resolve(false);
          } else {
            resolve(false);
          }
        }
      );
    } catch (e) {
      console.log('[Gila] Native messaging not installed.');
      resolve(false);
    }
  });
}

// Periodically re-discover if disconnected (handles Gila restart / new port)
setInterval(async () => {
  if (!bridge.isConnected) {
    await discoverViaNativeMessaging();
  }
}, 30000);

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
      // Clear stale config and re-discover
      bridge.disconnect();
      bridge.saveConfig(null, null);
      discoverViaNativeMessaging().then((ok) => {
        if (!ok) {
          // Fallback: read files directly isn't possible from extension,
          // so tell the user native messaging needs to be installed
          console.log('[Gila] Reconnect failed. Native messaging host may need to be reinstalled.');
        }
      });
      sendResponse({ ok: true });
      return true;

    case 'lookup':
      bridge.send({ method: 'lookup', url: request.url }).then(sendResponse);
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
  }
});
