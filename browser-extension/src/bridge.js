// Gila Browser Extension — WebSocket Bridge
// Manages persistent connection to Gila desktop app

export class GilaBridge {
  constructor() {
    this.ws = null;
    this.authenticated = false;
    this.port = null;
    this.token = null;
    this.reconnectDelay = 1000;
    this.maxReconnectDelay = 30000;
    this.pendingRequests = new Map();
    this.requestId = 0;
  }

  async loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['gilaPort', 'gilaToken'], (result) => {
        this.port = result.gilaPort || null;
        this.token = result.gilaToken || null;
        resolve();
      });
    });
  }

  saveConfig(port, token) {
    this.port = port;
    this.token = token;
    chrome.storage.local.set({ gilaPort: port, gilaToken: token });
  }

  connect() {
    if (!this.port || !this.token) return;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;

    try {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.reconnectDelay = 1000; // Reset backoff
      this.ws.send(JSON.stringify({ method: 'auth', token: this.token }));
    };

    this.ws.onmessage = (event) => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.result === 'authenticated') {
        this.authenticated = true;
        return;
      }

      if (data.error === 'invalid_token') {
        this.authenticated = false;
        this.ws.close();
        return;
      }

      // Resolve the oldest pending request
      if (this.pendingRequests.size > 0) {
        const [id, resolve] = this.pendingRequests.entries().next().value;
        this.pendingRequests.delete(id);
        resolve(data);
      }
    };

    this.ws.onclose = () => {
      this.authenticated = false;
      this.ws = null;
      // Reject all pending requests
      for (const [id, resolve] of this.pendingRequests) {
        resolve({ error: 'disconnected' });
      }
      this.pendingRequests.clear();
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  scheduleReconnect() {
    setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
  }

  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN && this.authenticated;
  }

  send(msg) {
    return new Promise((resolve) => {
      if (!this.isConnected) {
        resolve({ error: 'not_connected' });
        return;
      }

      const id = ++this.requestId;
      this.pendingRequests.set(id, resolve);
      this.ws.send(JSON.stringify(msg));

      // Timeout after 5 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({ error: 'timeout' });
        }
      }, 5000);
    });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
  }
}
