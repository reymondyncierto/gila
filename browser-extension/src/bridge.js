// Gila Browser Extension — WebSocket Bridge
// Manages persistent connection to Gila desktop app with auto-reconnect

const DISCOVERY_URL = 'http://127.0.0.1:21525/config';

export class GilaBridge {
  constructor() {
    this.ws = null;
    this.authenticated = false;
    this.port = null;
    this.token = null;
    this.pendingRequests = new Map();
    this.requestId = 0;
    this._reconnectTimer = null;
    this._heartbeatTimer = null;
    this._reconnectAttempt = 0;
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
    if (port && token) {
      chrome.storage.local.set({ gilaPort: port, gilaToken: token });
    }
  }

  /**
   * Discover the bridge config from the Gila desktop app's HTTP discovery endpoint.
   * Returns true if discovery succeeded and connection was initiated.
   */
  async discover() {
    try {
      const res = await fetch(DISCOVERY_URL);
      if (!res.ok) return false;
      const config = await res.json();
      if (config.port && config.token) {
        // Only reconnect if config actually changed
        if (config.port !== this.port || config.token !== this.token) {
          console.log('[Gila] Discovered new bridge config — port:', config.port);
          this.disconnect();
          this.saveConfig(config.port, config.token);
        }
        if (!this.isConnected) {
          this.connect();
        }
        return true;
      }
    } catch {
      // Gila not running
    }
    return false;
  }

  connect() {
    if (!this.port || !this.token) return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;

    try {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}`);
    } catch {
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this._reconnectAttempt = 0;
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
        console.log('[Gila] Connected and authenticated');
        this._startHeartbeat();
        return;
      }

      if (data.error === 'invalid_token') {
        console.log('[Gila] Invalid token — will re-discover');
        this.authenticated = false;
        this.ws.close();
        // Token is stale, clear it and re-discover
        this.saveConfig(null, null);
        this._scheduleReconnect();
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
      const wasAuthenticated = this.authenticated;
      this.authenticated = false;
      this.ws = null;
      this._stopHeartbeat();

      // Reject all pending requests
      for (const [, resolve] of this.pendingRequests) {
        resolve({ error: 'disconnected' });
      }
      this.pendingRequests.clear();

      if (wasAuthenticated) {
        console.log('[Gila] Connection lost — reconnecting...');
      }
      this._scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  _scheduleReconnect() {
    if (this._reconnectTimer) return; // Already scheduled

    this._reconnectAttempt++;
    // Fast reconnect: 1s, 2s, 3s, 5s, then 5s forever
    const delays = [1000, 2000, 3000, 5000];
    const delay = delays[Math.min(this._reconnectAttempt - 1, delays.length - 1)];

    this._reconnectTimer = setTimeout(async () => {
      this._reconnectTimer = null;
      // Always re-discover fresh config (Gila may have restarted with a new port)
      const discovered = await this.discover();
      if (!discovered) {
        // Discovery failed — Gila not running, keep trying
        this._scheduleReconnect();
      }
    }, delay);
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    // Send a status ping every 10 seconds to detect stale connections
    this._heartbeatTimer = setInterval(() => {
      if (this.isConnected) {
        try {
          this.ws.send(JSON.stringify({ method: 'status' }));
        } catch {
          // Connection broken
          this.ws?.close();
        }
      }
    }, 10000);
  }

  _stopHeartbeat() {
    if (this._heartbeatTimer) {
      clearInterval(this._heartbeatTimer);
      this._heartbeatTimer = null;
    }
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

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          resolve({ error: 'timeout' });
        }
      }, 5000);
    });
  }

  disconnect() {
    this._stopHeartbeat();
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.onclose = null; // Prevent reconnect loop
      this.ws.close();
      this.ws = null;
    }
    this.authenticated = false;
  }
}
