// Gila Browser Extension — Inline Suggestion
// Shows a small Gila icon inside detected login fields with a dropdown of matching credentials

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="none">
  <rect width="16" height="16" rx="4" fill="#1a1a2e"/>
  <text x="8" y="12" text-anchor="middle" font-size="10" fill="#4ade80">G</text>
</svg>`;

let activeDropdown = null;

/**
 * Attach inline suggestion icons to detected form fields.
 * Only shows if matching credentials exist for the current URL.
 *
 * @param {Array} detectedForms
 * @param {Array} matchingCredentials - Credentials from vault matching current URL
 */
export function attachInlineSuggestions(detectedForms, matchingCredentials) {
  if (matchingCredentials.length === 0) return;

  for (const detected of detectedForms) {
    const fields = [detected.usernameField, detected.passwordField].filter(Boolean);
    for (const field of fields) {
      if (field.dataset.gilaIcon) continue; // Already attached
      field.dataset.gilaIcon = 'true';
      attachIconToField(field, matchingCredentials);
    }
  }
}

function attachIconToField(input, credentials) {
  // Ensure parent has relative positioning for icon placement
  const parent = input.parentElement;
  if (parent && getComputedStyle(parent).position === 'static') {
    parent.style.position = 'relative';
  }

  // Create icon button
  const icon = document.createElement('div');
  icon.className = 'gila-inline-icon';
  icon.innerHTML = ICON_SVG;
  icon.style.cssText = `
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    cursor: pointer;
    z-index: 2147483646;
    opacity: 0.7;
    transition: opacity 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  `;
  icon.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
  icon.addEventListener('mouseleave', () => { icon.style.opacity = '0.7'; });

  // Position relative to the input
  const inputRect = input.getBoundingClientRect();
  if (parent) {
    parent.appendChild(icon);
  } else {
    input.insertAdjacentElement('afterend', icon);
  }

  // Click handler to show dropdown
  icon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggleDropdown(icon, input, credentials);
  });

  // Pad input so text doesn't overlap icon
  const currentPadding = parseInt(getComputedStyle(input).paddingRight) || 0;
  if (currentPadding < 32) {
    input.style.paddingRight = '32px';
  }
}

function toggleDropdown(icon, input, credentials) {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
    return;
  }

  // Create dropdown using Shadow DOM to avoid CSS conflicts
  const host = document.createElement('div');
  host.style.cssText = `
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    z-index: 2147483647;
  `;

  const shadow = host.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    .gila-dropdown {
      width: 260px;
      background: #0f0f1a;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.5);
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }
    .gila-dropdown-header {
      padding: 8px 12px;
      font-size: 10px;
      font-weight: 600;
      color: rgba(255,255,255,0.35);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .gila-dropdown-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .gila-dropdown-item:hover {
      background: rgba(255,255,255,0.06);
    }
    .gila-dropdown-icon {
      font-size: 16px;
      flex-shrink: 0;
    }
    .gila-dropdown-info {
      flex: 1;
      min-width: 0;
    }
    .gila-dropdown-name {
      font-size: 12px;
      font-weight: 500;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .gila-dropdown-hint {
      font-size: 10px;
      color: rgba(255,255,255,0.35);
    }
  `;

  const dropdown = document.createElement('div');
  dropdown.className = 'gila-dropdown';

  const header = document.createElement('div');
  header.className = 'gila-dropdown-header';
  header.textContent = 'Gila Vault';
  dropdown.appendChild(header);

  for (const cred of credentials) {
    const item = document.createElement('div');
    item.className = 'gila-dropdown-item';
    item.innerHTML = `
      <span class="gila-dropdown-icon">\uD83C\uDF10</span>
      <div class="gila-dropdown-info">
        <div class="gila-dropdown-name">${escapeHtml(cred.name)}</div>
        <div class="gila-dropdown-hint">Click to fill</div>
      </div>
    `;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      fillFromDropdown(cred.id);
      host.remove();
      activeDropdown = null;
    });
    dropdown.appendChild(item);
  }

  shadow.appendChild(style);
  shadow.appendChild(dropdown);

  const parent = icon.parentElement;
  parent.appendChild(host);
  activeDropdown = host;

  // Close on outside click
  const closeHandler = (e) => {
    if (!host.contains(e.target) && e.target !== icon) {
      host.remove();
      activeDropdown = null;
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      host.remove();
      activeDropdown = null;
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);
}

function fillFromDropdown(credId) {
  chrome.runtime.sendMessage(
    { type: 'get_credential', id: credId },
    (response) => {
      if (response?.result?.data) {
        const data = response.result.data;
        // Dispatch fill message to self (content script handles it)
        chrome.runtime.sendMessage({
          type: 'fill_request_self',
          username: data.username || data.email || '',
          password: data.password || '',
        });
      }
    }
  );
}

function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}
