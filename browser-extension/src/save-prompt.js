// Gila Browser Extension — Save Prompt
// Detects form submissions with new credentials and offers to save them

const DISMISS_TIMEOUT_MS = 15000;

/**
 * Attach save detection to detected forms.
 * Listens for form submission and offers to save new credentials.
 *
 * @param {Array<{form: HTMLFormElement|null, usernameField: HTMLInputElement|null, passwordField: HTMLInputElement|null}>} detectedForms
 */
export function attachSaveDetection(detectedForms) {
  for (const detected of detectedForms) {
    const { form, usernameField, passwordField } = detected;
    if (!passwordField) continue;

    const handler = () => {
      const username = usernameField?.value || '';
      const password = passwordField?.value || '';

      if (!password) return; // No password entered

      // Check if this credential already exists in the vault
      chrome.runtime.sendMessage(
        { type: 'lookup', url: window.location.href },
        (response) => {
          const existing = response?.result || [];
          // Simple check: if any credential matches, don't prompt
          // (A more sophisticated check would compare usernames)
          if (existing.length > 0) return;

          showSavePrompt(username, password);
        }
      );
    };

    if (form) {
      form.addEventListener('submit', handler);
    }

    // Also detect clicks on submit buttons (for forms that use JS submission)
    const submitButtons = (form || document).querySelectorAll(
      'button[type="submit"], input[type="submit"], button:not([type])'
    );
    for (const btn of submitButtons) {
      btn.addEventListener('click', () => {
        // Delay slightly to let the form values update
        setTimeout(handler, 100);
      });
    }
  }
}

/**
 * Show a save prompt banner at the top of the page.
 * @param {string} username
 * @param {string} password
 */
function showSavePrompt(username, password) {
  // Remove any existing prompt
  const existing = document.getElementById('gila-save-prompt');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'gila-save-prompt';
  banner.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 2147483647;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    animation: gilaSlideDown 0.3s ease-out;
  `;

  const style = document.createElement('style');
  style.textContent = `
    @keyframes gilaSlideDown {
      from { transform: translateY(-100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
  `;
  banner.appendChild(style);

  const textContainer = document.createElement('div');
  textContainer.style.cssText = 'display: flex; align-items: center; gap: 12px;';
  textContainer.innerHTML = `
    <span style="font-size: 20px;">🔐</span>
    <div>
      <div style="color: #fff; font-size: 13px; font-weight: 600;">Save to Gila?</div>
      <div style="color: rgba(255,255,255,0.5); font-size: 11px;">
        ${escapeHtml(username || 'No username')} on ${escapeHtml(window.location.hostname)}
      </div>
    </div>
  `;

  const btnContainer = document.createElement('div');
  btnContainer.style.cssText = 'display: flex; gap: 8px;';

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save to Gila';
  saveBtn.style.cssText = `
    padding: 6px 16px;
    background: rgba(74, 222, 128, 0.15);
    color: #4ade80;
    border: 1px solid rgba(74, 222, 128, 0.3);
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  `;
  saveBtn.addEventListener('click', () => {
    saveCredential(username, password);
    banner.remove();
  });

  const dismissBtn = document.createElement('button');
  dismissBtn.textContent = 'Dismiss';
  dismissBtn.style.cssText = `
    padding: 6px 16px;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.5);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 6px;
    font-size: 12px;
    cursor: pointer;
  `;
  dismissBtn.addEventListener('click', () => banner.remove());

  btnContainer.appendChild(saveBtn);
  btnContainer.appendChild(dismissBtn);
  banner.appendChild(textContainer);
  banner.appendChild(btnContainer);
  document.body.appendChild(banner);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (banner.parentNode) banner.remove();
  }, DISMISS_TIMEOUT_MS);
}

/**
 * Send save request to Gila via background script.
 * @param {string} username
 * @param {string} password
 */
function saveCredential(username, password) {
  chrome.runtime.sendMessage({
    type: 'save_credential',
    name: document.title || window.location.hostname,
    url: window.location.href,
    username,
    password,
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
