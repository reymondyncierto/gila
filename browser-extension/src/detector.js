// Gila Browser Extension — Form Detector
// Detects login forms on web pages using heuristics

const USERNAME_HINTS = [
  'username', 'user', 'email', 'login', 'identifier', 'account',
  'userid', 'user_id', 'user-id', 'loginid', 'signin',
];

const PASSWORD_HINTS = [
  'password', 'pass', 'passwd', 'pwd', 'secret',
];

const AUTOCOMPLETE_USERNAME = ['username', 'email'];
const AUTOCOMPLETE_PASSWORD = ['current-password', 'new-password'];

/**
 * @typedef {Object} DetectedForm
 * @property {HTMLFormElement|null} form
 * @property {HTMLInputElement|null} usernameField
 * @property {HTMLInputElement|null} passwordField
 */

/**
 * Check if an input matches username heuristics.
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
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

/**
 * Check if an input is a password field.
 * @param {HTMLInputElement} input
 * @returns {boolean}
 */
function isPasswordField(input) {
  if (input.type === 'password') return true;

  const autocomplete = (input.autocomplete || '').toLowerCase();
  if (AUTOCOMPLETE_PASSWORD.some(h => autocomplete.includes(h))) return true;

  return false;
}

/**
 * Find the username field associated with a password field.
 * Looks backwards in the DOM for the nearest matching input.
 * @param {HTMLInputElement} passwordField
 * @returns {HTMLInputElement|null}
 */
function findAssociatedUsernameField(passwordField) {
  const form = passwordField.closest('form');
  const container = form || passwordField.closest('div, section, main') || document.body;

  const inputs = Array.from(container.querySelectorAll('input'));
  const pwIndex = inputs.indexOf(passwordField);

  // Search backwards from the password field
  for (let i = pwIndex - 1; i >= 0; i--) {
    if (isUsernameField(inputs[i]) && inputs[i].offsetParent !== null) {
      return inputs[i];
    }
  }

  // Search forwards as fallback
  for (let i = pwIndex + 1; i < inputs.length; i++) {
    if (isUsernameField(inputs[i]) && inputs[i].offsetParent !== null) {
      return inputs[i];
    }
  }

  return null;
}

/**
 * Scan the page for login forms.
 * @returns {DetectedForm[]}
 */
export function detectLoginForms() {
  /** @type {DetectedForm[]} */
  const results = [];
  const seen = new Set();

  const passwordFields = document.querySelectorAll('input[type="password"]');

  for (const pwField of passwordFields) {
    // Skip hidden fields
    if (pwField.offsetParent === null && !pwField.closest('[style*="display"]')) continue;
    if (seen.has(pwField)) continue;
    seen.add(pwField);

    const usernameField = findAssociatedUsernameField(pwField);
    const form = pwField.closest('form');

    results.push({
      form,
      usernameField,
      passwordField: pwField,
    });
  }

  return results;
}

/**
 * Watch for dynamically added forms using MutationObserver.
 * @param {(forms: DetectedForm[]) => void} callback
 * @returns {MutationObserver}
 */
export function watchForForms(callback) {
  let debounceTimer = null;

  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const forms = detectLoginForms();
      if (forms.length > 0) {
        callback(forms);
      }
    }, 500);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  return observer;
}
