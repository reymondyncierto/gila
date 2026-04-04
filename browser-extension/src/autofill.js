// Gila Browser Extension — Auto-Fill Module
// Fills credentials into login forms, compatible with React/Angular/Vue

/**
 * Set an input's value in a way that works with modern frontend frameworks.
 *
 * React uses synthetic events and controls inputs via internal fiber state.
 * Simply setting `input.value` doesn't trigger React's onChange handler.
 * We use the native HTMLInputElement value setter to bypass this, then
 * dispatch the appropriate DOM events.
 *
 * @param {HTMLInputElement} input
 * @param {string} value
 */
export function setInputValue(input, value) {
  // Focus the input first (some frameworks require it)
  input.focus();

  // Use the native setter to bypass React's controlled input interception.
  // React replaces the value property descriptor, so we need the original.
  const nativeSet = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  if (nativeSet) {
    nativeSet.call(input, value);
  } else {
    input.value = value;
  }

  // Dispatch InputEvent with proper inputType for maximum framework compatibility.
  // - React listens for 'input' events on the document via event delegation
  // - Angular listens for 'input' events directly on elements
  // - Vue v-model listens for 'input' events
  input.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: value,
  }));

  // 'change' event for legacy handlers and Angular reactive forms
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // 'blur' to trigger validation in many form libraries
  input.dispatchEvent(new Event('blur', { bubbles: true }));
}

/**
 * Fill username and password into a detected form.
 *
 * @param {Object} form - A detected form object with usernameField and passwordField
 * @param {string} username
 * @param {string} password
 */
export function fillForm(form, username, password) {
  if (form.usernameField && username) {
    setInputValue(form.usernameField, username);
    highlightField(form.usernameField);
  }

  if (form.passwordField && password) {
    setInputValue(form.passwordField, password);
    highlightField(form.passwordField);
  }
}

/**
 * Briefly highlight a filled field with a green outline to give visual feedback.
 * @param {HTMLInputElement} input
 */
function highlightField(input) {
  const originalOutline = input.style.outline;
  const originalTransition = input.style.transition;

  input.style.transition = 'outline 0.3s ease';
  input.style.outline = '2px solid rgba(74, 222, 128, 0.6)';

  setTimeout(() => {
    input.style.outline = originalOutline;
    setTimeout(() => {
      input.style.transition = originalTransition;
    }, 300);
  }, 1500);
}
