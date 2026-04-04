// Gila Browser Extension — Background Service Worker
// Bridge auto-discovers and auto-reconnects to Gila desktop app

import { GilaBridge } from './bridge.js';

const bridge = new GilaBridge();

// Start: discover and connect
bridge.discover();

// Watch for tab navigation — when a user leaves a login page after typing credentials,
// check storage for pending credentials and auto-save them
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  if (!bridge.isConnected) return;

  try {
    const data = await chrome.storage.session.get('pendingCredential');
    const cred = data.pendingCredential;
    if (!cred) return;

    // Only process if less than 60 seconds old
    if (Date.now() - cred.timestamp > 60000) {
      chrome.storage.session.remove('pendingCredential');
      return;
    }

    // Get the current tab's URL to see if we navigated away from the login page
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.url) return;

    // If we're still on the same login page, don't save yet
    if (tab.url.includes('signin') || tab.url.includes('login') || tab.url.includes('auth')) return;

    console.log('[Gila] Tab navigated after login — auto-saving credential for', cred.username);

    const result = await bridge.send({
      method: 'save_credential',
      name: cred.name,
      url: cred.url,
      username: cred.username,
      password: cred.password,
    });

    if (result?.result) {
      console.log('[Gila] Auto-saved credential:', result.result.name);
    }

    // Clear pending credential
    chrome.storage.session.remove('pendingCredential');
  } catch (e) {
    console.log('[Gila] Error checking pending credential:', e);
  }
});

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
