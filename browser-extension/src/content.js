// Gila Browser Extension — Content Script
// Injected into all web pages to detect login forms

// ===== Form Detection =====

const USERNAME_HINTS = [
  'username', 'user', 'email', 'login', 'identifier', 'account',
  'userid', 'user_id', 'user-id', 'loginid', 'signin',
];

const AUTOCOMPLETE_USERNAME = ['username', 'email'];
const AUTOCOMPLETE_PASSWORD = ['current-password', 'new-password'];

function isUsernameField(input) {
  if (input.type === 'hidden' || input.type === 'submit' || input.type === 'button') return false;

  const autocomplete = (input.autocomplete || '').toLowerCase();
  if (AUTOCOMPLETE_USERNAME.some(h => autocomplete.includes(h))) return true;

  const searchStr = [
    input.name, input.id, input.placeholder,
    input.getAttribute('aria-label') || '',
  ].join(' ').toLowerCase();

  return USERNAME_HINTS.some(hint => searchStr.includes(hint)) ||
    (input.type === 'email') ||
    (input.type === 'text' && searchStr.includes('mail'));
}

function findAssociatedUsernameField(passwordField) {
  const form = passwordField.closest('form');
  const container = form || passwordField.closest('div, section, main') || document.body;
  const inputs = Array.from(container.querySelectorAll('input'));
  const pwIndex = inputs.indexOf(passwordField);

  for (let i = pwIndex - 1; i >= 0; i--) {
    if (isUsernameField(inputs[i]) && inputs[i].offsetParent !== null) return inputs[i];
  }
  for (let i = pwIndex + 1; i < inputs.length; i++) {
    if (isUsernameField(inputs[i]) && inputs[i].offsetParent !== null) return inputs[i];
  }
  return null;
}

function detectLoginForms() {
  const results = [];
  const seen = new Set();
  const passwordFields = document.querySelectorAll('input[type="password"]');

  for (const pwField of passwordFields) {
    if (pwField.offsetParent === null) continue;
    if (seen.has(pwField)) continue;
    seen.add(pwField);

    results.push({
      form: pwField.closest('form'),
      usernameField: findAssociatedUsernameField(pwField),
      passwordField: pwField,
    });
  }
  return results;
}

// ===== Content Script Logic =====

console.log('[Gila] Content script loaded on', window.location.href);

let detectedForms = [];
const savedFormRefs = new WeakSet();
let savePromptShown = false;
let activeInlineDropdown = null;

function onFormsDetected(forms) {
  detectedForms = forms;
  console.log('[Gila] Detected', forms.length, 'login form(s)',
    forms.map(f => ({
      username: f.usernameField?.name || f.usernameField?.id || '(none)',
      password: f.passwordField?.name || f.passwordField?.id || '(none)',
    }))
  );
  chrome.runtime.sendMessage({
    type: 'forms_detected',
    url: window.location.href,
    count: forms.length,
  }).catch(() => {});

  // Attach save detection to newly detected forms
  attachSaveDetection(forms);

  // Query vault for matching credentials and show inline icons
  // Include detected username so the backend can narrow results
  const detectedUser = forms[0]?.usernameField?.value || findUsernameOnPage() || '';
  chrome.runtime.sendMessage(
    { type: 'lookup', url: window.location.href, username: detectedUser },
    (response) => {
      const matches = response?.result || [];
      if (matches.length > 0) {
        attachInlineIcons(forms, matches);
      }
    }
  );
}

// Initial scan
const initialForms = detectLoginForms();
console.log('[Gila] Initial scan found', initialForms.length, 'form(s)');
if (initialForms.length > 0) {
  onFormsDetected(initialForms);
} else {
  console.log('[Gila] No forms found yet, watching for dynamic forms...');
}

// Watch for dynamically added forms via MutationObserver
let debounceTimer = null;
const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const forms = detectLoginForms();
    if (forms.length > 0) onFormsDetected(forms);
  }, 500);
});
observer.observe(document.body, { childList: true, subtree: true });

// ===== Auto-Fill =====

function setInputValue(input, value) {
  const nativeSet = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  if (nativeSet) {
    nativeSet.call(input, value);
  } else {
    input.value = value;
  }

  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('blur', { bubbles: true }));

  // Brief green highlight to confirm fill
  const orig = input.style.outline;
  input.style.outline = '2px solid rgba(74, 222, 128, 0.6)';
  setTimeout(() => { input.style.outline = orig; }, 1500);
}

function fillCredential(username, password) {
  if (detectedForms.length === 0) return;
  const form = detectedForms[0];
  if (form.usernameField && username) setInputValue(form.usernameField, username);
  if (form.passwordField && password) setInputValue(form.passwordField, password);
}

// ===== Message Handling =====

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'get_detected_forms') {
    sendResponse({
      count: detectedForms.length,
      forms: detectedForms.map(f => ({
        hasUsername: !!f.usernameField,
        hasPassword: !!f.passwordField,
      })),
    });
    return true;
  }

  if (request.type === 'fill_credential') {
    fillCredential(request.username, request.password);
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'get_form_values') {
    if (detectedForms.length === 0) {
      sendResponse(null);
      return true;
    }
    const form = detectedForms[0];
    sendResponse({
      username: form.usernameField?.value || '',
      password: form.passwordField?.value || '',
      url: window.location.href,
      hostname: window.location.hostname,
    });
    return true;
  }
});

// ===== Save Detection =====

// Track the last password typed (captures it live, before navigation clears it)
let lastTypedPassword = '';
let lastTypedUsername = '';

function attachSaveDetection(forms) {
  for (const detected of forms) {
    const { form, usernameField, passwordField } = detected;
    if (!passwordField) continue;
    if (passwordField.dataset.gilaSave) continue;
    passwordField.dataset.gilaSave = 'true';

    // Capture password as the user types (before JS can clear it on submit)
    passwordField.addEventListener('input', () => {
      lastTypedPassword = passwordField.value;
    });
    if (usernameField) {
      usernameField.addEventListener('input', () => {
        lastTypedUsername = usernameField.value;
      });
    }

    const handler = () => {
      if (savePromptShown) return;

      // Get username from: input field > last typed > page text (for multi-step like Google)
      const username = usernameField?.value || lastTypedUsername || findUsernameOnPage() || '';
      const password = passwordField?.value || lastTypedPassword || '';

      console.log('[Gila] Save handler triggered — username:', username ? `"${username}"` : 'empty', 'password:', password ? 'filled' : 'empty');
      if (!password) return;

      savePromptShown = true;

      chrome.runtime.sendMessage(
        { type: 'lookup', url: window.location.href },
        (response) => {
          console.log('[Gila] Lookup response:', response);
          const existing = response?.result || [];
          if (existing.length > 0) {
            console.log('[Gila] Credentials already exist, skipping save prompt');
            savePromptShown = false;
            return;
          }
          console.log('[Gila] Showing save banner');
          showSaveBanner(username, password);
        }
      );
    };

    // 1. Native form submit
    if (form) {
      form.addEventListener('submit', () => setTimeout(handler, 100));
    }

    // 2. Click on ANY button on the page (login buttons vary wildly across sites)
    document.addEventListener('click', (e) => {
      const target = e.target.closest('button, [role="button"], input[type="submit"], a');
      if (!target) return;
      // Only trigger if password field has been filled
      if (!passwordField.value && !lastTypedPassword) return;
      setTimeout(handler, 300);
    }, { capture: true });

    // 3. Enter key in the password field
    passwordField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') setTimeout(handler, 300);
    });

    // 4. Catch page navigation — send to background for auto-save
    window.addEventListener('beforeunload', () => {
      const username = usernameField?.value || lastTypedUsername || findUsernameOnPage() || '';
      const password = passwordField?.value || lastTypedPassword || '';
      if (password && !savePromptShown) {
        console.log('[Gila] Page navigating with credentials, sending pending_save');
        chrome.runtime.sendMessage({
          type: 'pending_save',
          name: document.title || window.location.hostname,
          url: window.location.href,
          username,
          password,
        }).catch(() => {});
      }
    });
  }
}

/**
 * For multi-step logins (Google, Microsoft, etc.), the username was entered
 * on a previous page. Try to find it displayed as text on the current page.
 * Looks for email-like text near the password field.
 */
function findUsernameOnPage() {
  // Look for a visible element showing an email address (common on step-2 login pages)
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // Check common selectors used by Google, Microsoft, etc.
  const selectors = [
    '[data-identifier]',         // Google
    '#profileIdentifier',        // Google
    '.profile-name',             // Various
    '[data-email]',              // Various
  ];

  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) {
      const text = el.textContent?.trim() || el.getAttribute('data-identifier') || el.getAttribute('data-email') || '';
      if (text && emailRegex.test(text)) return text;
      if (text) return text;
    }
  }

  // Fallback: scan visible text near the password field for an email pattern
  const passField = document.querySelector('input[type="password"]');
  if (passField) {
    const container = passField.closest('form') || passField.closest('main, [role="main"], body');
    if (container) {
      const text = container.innerText || '';
      const match = text.match(emailRegex);
      if (match) return match[0];
    }
  }

  return '';
}

function showSaveBanner(username, password) {
  const existing = document.getElementById('gila-save-prompt');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'gila-save-prompt';
  banner.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; z-index: 2147483647;
    display: flex; align-items: center; justify-content: space-between;
    padding: 12px 20px;
    background: linear-gradient(135deg, #1a1a2e, #16213e);
    border-bottom: 1px solid rgba(255,255,255,0.1);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
  `;

  banner.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px">
      <span style="font-size:20px">\uD83D\uDD10</span>
      <div>
        <div style="color:#fff;font-size:13px;font-weight:600">Save to Gila?</div>
        <div style="color:rgba(255,255,255,0.5);font-size:11px">
          ${escapeForHTML(username || 'No username')} on ${escapeForHTML(window.location.hostname)}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button id="gila-save-btn" style="padding:6px 16px;background:rgba(74,222,128,0.15);color:#4ade80;border:1px solid rgba(74,222,128,0.3);border-radius:6px;font-size:12px;cursor:pointer">Save</button>
      <button id="gila-dismiss-btn" style="padding:6px 16px;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.1);border-radius:6px;font-size:12px;cursor:pointer">Dismiss</button>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelector('#gila-save-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'save_credential',
      name: document.title || window.location.hostname,
      url: window.location.href,
      username,
      password,
    });
    banner.remove();
  });

  banner.querySelector('#gila-dismiss-btn').addEventListener('click', () => banner.remove());

  // Auto-dismiss after 15 seconds
  setTimeout(() => { if (banner.parentNode) banner.remove(); }, 15000);
}

function escapeForHTML(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

// ===== Inline Suggestion Icons =====

function attachInlineIcons(forms, credentials) {
  for (const detected of forms) {
    const fields = [detected.usernameField, detected.passwordField].filter(Boolean);
    for (const field of fields) {
      if (field.dataset.gilaIcon) continue;
      field.dataset.gilaIcon = 'true';

      const parent = field.parentElement;
      if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }

      const icon = document.createElement('div');
      icon.style.cssText = `
        position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
        width: 20px; height: 20px; cursor: pointer; z-index: 2147483646;
        opacity: 0.6; transition: opacity 0.2s;
        display: flex; align-items: center; justify-content: center;
        background: #1a1a2e; border-radius: 4px;
        font-size: 11px; font-weight: 700; color: #4ade80;
      `;
      icon.textContent = 'G';
      icon.addEventListener('mouseenter', () => { icon.style.opacity = '1'; });
      icon.addEventListener('mouseleave', () => { icon.style.opacity = '0.6'; });

      if (parent) parent.appendChild(icon);
      else field.insertAdjacentElement('afterend', icon);

      // Pad input text
      const padR = parseInt(getComputedStyle(field).paddingRight) || 0;
      if (padR < 32) field.style.paddingRight = '32px';

      icon.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showInlineDropdown(icon, credentials);
      });
    }
  }
}

function showInlineDropdown(icon, credentials) {
  if (activeInlineDropdown) { activeInlineDropdown.remove(); activeInlineDropdown = null; return; }

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;right:0;top:calc(100% + 4px);z-index:2147483647;';

  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>
      .dd{width:250px;background:#0f0f1a;border:1px solid rgba(255,255,255,0.12);border-radius:10px;box-shadow:0 8px 30px rgba(0,0,0,0.5);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
      .hd{padding:8px 12px;font-size:10px;font-weight:600;color:rgba(255,255,255,0.35);text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid rgba(255,255,255,0.06)}
      .it{display:flex;align-items:center;gap:10px;padding:10px 12px;cursor:pointer;transition:background 0.15s}
      .it:hover{background:rgba(255,255,255,0.06)}
      .nm{font-size:12px;font-weight:500;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ht{font-size:10px;color:rgba(255,255,255,0.35)}
    </style>
    <div class="dd">
      <div class="hd">Gila Vault</div>
      ${credentials.map(c => `<div class="it" data-id="${c.id}"><span style="font-size:16px">\uD83C\uDF10</span><div><div class="nm">${escapeForHTML(c.name)}</div><div class="ht">Click to fill</div></div></div>`).join('')}
    </div>
  `;

  shadow.querySelectorAll('.it').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const credId = item.dataset.id;
      chrome.runtime.sendMessage({ type: 'get_credential', id: credId }, (res) => {
        if (res?.result?.data) {
          fillCredential(res.result.data.username || '', res.result.data.password || '');
        }
      });
      host.remove();
      activeInlineDropdown = null;
    });
  });

  icon.parentElement.appendChild(host);
  activeInlineDropdown = host;

  const close = (e) => {
    if (!host.contains(e.target) && e.target !== icon) {
      host.remove(); activeInlineDropdown = null;
      document.removeEventListener('click', close);
    }
  };
  setTimeout(() => document.addEventListener('click', close), 0);

  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { host.remove(); activeInlineDropdown = null; document.removeEventListener('keydown', esc); }
  });
}
