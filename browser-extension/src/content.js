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

let detectedForms = [];

function onFormsDetected(forms) {
  detectedForms = forms;
  chrome.runtime.sendMessage({
    type: 'forms_detected',
    url: window.location.href,
    count: forms.length,
  }).catch(() => {});

  // Attach save detection to newly detected forms
  attachSaveDetection(forms);
}

// Initial scan
const initialForms = detectLoginForms();
if (initialForms.length > 0) {
  onFormsDetected(initialForms);
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

const savedFormRefs = new WeakSet();

function attachSaveDetection(forms) {
  for (const detected of forms) {
    const { form, usernameField, passwordField } = detected;
    if (!passwordField) continue;
    if (form && savedFormRefs.has(form)) continue;
    if (form) savedFormRefs.add(form);

    const handler = () => {
      const username = usernameField?.value || '';
      const password = passwordField?.value || '';
      if (!password) return;

      // Check if credentials already exist for this site
      chrome.runtime.sendMessage(
        { type: 'lookup', url: window.location.href },
        (response) => {
          const existing = response?.result || [];
          if (existing.length > 0) return;
          showSaveBanner(username, password);
        }
      );
    };

    if (form) {
      form.addEventListener('submit', handler);
    }

    // Detect submit button clicks (for JS-driven forms)
    const container = form || document;
    const submitBtns = container.querySelectorAll(
      'button[type="submit"], input[type="submit"]'
    );
    for (const btn of submitBtns) {
      btn.addEventListener('click', () => setTimeout(handler, 100));
    }
  }
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
