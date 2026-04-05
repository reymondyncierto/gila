// Gila Browser Extension — Background Service Worker

import { GilaBridge } from './bridge.js';

const bridge = new GilaBridge();
bridge.discover();

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
      }).then((result) => {
        console.log('[Gila] Save result:', result);
        // If the vault was locked, the credential was queued — notify the tab
        if (result?.result?.queued && sender?.tab?.id) {
          chrome.tabs.sendMessage(sender.tab.id, {
            type: 'save_queued',
            name: result.result.name,
          }).catch(() => {});
        }
        sendResponse(result);
      });
      return true;

    case 'unlock':
      bridge.send({ method: 'unlock', password: request.password }).then(sendResponse);
      return true;

    case 'focus_app':
      bridge.send({ method: 'focus_app' }).then(sendResponse);
      return true;

    case 'bridge_send':
      bridge.send(request.payload).then(sendResponse);
      return true;

    case 'forms_detected':
      sendResponse({ ok: true });
      return true;
  }
});
