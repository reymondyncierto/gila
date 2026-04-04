// Gila Browser Extension — Background Service Worker
// Hub for WebSocket bridge and message routing
// Auto-discovers bridge connection via Native Messaging

import { GilaBridge } from './bridge.js';

const NATIVE_HOST_NAME = 'com.rpyncierto.gila';
const bridge = new GilaBridge();

// Auto-discover bridge config on startup
async function autoConnect() {
  // First try saved config
  await bridge.loadConfig();
  if (bridge.port && bridge.token) {
    bridge.connect();
    // Verify connection works; if not, try native messaging
    setTimeout(() => {
      if (!bridge.isConnected) {
        discoverViaNativeMessaging();
      }
    }, 2000);
    return;
  }

  // No saved config — try native messaging
  discoverViaNativeMessaging();
}

function discoverViaNativeMessaging() {
  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);

    port.onMessage.addListener((response) => {
      if (response.port && response.token) {
        console.log('[Gila] Auto-discovered bridge config via native messaging');
        bridge.saveConfig(response.port, response.token);
        bridge.connect();
      } else if (response.error) {
        console.warn('[Gila] Native host error:', response.message || response.error);
      }
      port.disconnect();
    });

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError;
      if (error) {
        console.log('[Gila] Native messaging not available:', error.message);
        console.log('[Gila] Use the popup settings to configure manually.');
      }
    });

    // Send request for config
    port.postMessage({ action: 'get_config' });
  } catch (e) {
    console.log('[Gila] Native messaging not installed. Use popup to configure manually.');
  }
}

// Also periodically refresh config in case Gila was restarted (new port)
setInterval(() => {
  if (!bridge.isConnected) {
    discoverViaNativeMessaging();
  }
}, 30000); // Every 30 seconds if disconnected

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
      discoverViaNativeMessaging();
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
