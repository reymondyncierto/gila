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
