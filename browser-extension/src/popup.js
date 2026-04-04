// Gila Browser Extension — Popup Script
// Placeholder — will be implemented in TASK-031

const statusEl = document.getElementById('status');

chrome.runtime.sendMessage({ type: 'bridge_status' }, (response) => {
  if (response?.connected) {
    statusEl.textContent = 'Connected to Gila';
    statusEl.className = 'status connected';
  } else {
    statusEl.textContent = 'Not connected — open Gila desktop app';
    statusEl.className = 'status error';
  }
});
