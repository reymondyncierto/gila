// Gila Browser Extension — Background Service Worker
// Manages WebSocket connection to Gila desktop app

let ws = null;
let authenticated = false;
let connectionConfig = { port: null, token: null };

// Load config from storage
chrome.storage.local.get(['gilaPort', 'gilaToken'], (result) => {
  if (result.gilaPort && result.gilaToken) {
    connectionConfig.port = result.gilaPort;
    connectionConfig.token = result.gilaToken;
    connect();
  }
});

function connect() {
  if (!connectionConfig.port || !connectionConfig.token) return;
  if (ws && ws.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(`ws://127.0.0.1:${connectionConfig.port}`);
  } catch {
    return;
  }

  ws.onopen = () => {
    // Authenticate
    ws.send(JSON.stringify({ method: 'auth', token: connectionConfig.token }));
  };

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.result === 'authenticated') {
      authenticated = true;
      return;
    }
    // Route response to whoever is waiting
    if (pendingResolve) {
      pendingResolve(data);
      pendingResolve = null;
    }
  };

  ws.onclose = () => {
    authenticated = false;
    ws = null;
    // Reconnect after 5 seconds
    setTimeout(connect, 5000);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

let pendingResolve = null;

function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    if (!ws || ws.readyState !== WebSocket.OPEN || !authenticated) {
      resolve({ error: 'not_connected' });
      return;
    }
    pendingResolve = resolve;
    ws.send(JSON.stringify(msg));
    // Timeout after 5 seconds
    setTimeout(() => {
      if (pendingResolve === resolve) {
        pendingResolve = null;
        resolve({ error: 'timeout' });
      }
    }, 5000);
  });
}

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'bridge_status') {
    sendResponse({
      connected: ws && ws.readyState === WebSocket.OPEN && authenticated,
    });
    return true;
  }

  if (request.type === 'bridge_send') {
    sendMessage(request.payload).then(sendResponse);
    return true; // async response
  }

  if (request.type === 'update_config') {
    connectionConfig.port = request.port;
    connectionConfig.token = request.token;
    chrome.storage.local.set({
      gilaPort: request.port,
      gilaToken: request.token,
    });
    if (ws) ws.close();
    connect();
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'lookup') {
    sendMessage({ method: 'lookup', url: request.url }).then(sendResponse);
    return true;
  }

  if (request.type === 'get_credential') {
    sendMessage({ method: 'get_credential', id: request.id }).then(sendResponse);
    return true;
  }

  if (request.type === 'save_credential') {
    sendMessage({
      method: 'save_credential',
      name: request.name,
      url: request.url,
      username: request.username,
      password: request.password,
    }).then(sendResponse);
    return true;
  }
});
