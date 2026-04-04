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
  const pageEmail = findUsernameOnPage();
  console.log('[Gila] Detected', forms.length, 'login form(s)',
    forms.map(f => ({
      username: f.usernameField?.name || f.usernameField?.id || '(none)',
      password: f.passwordField?.name || f.passwordField?.id || '(none)',
    })),
    'pageEmail:', pageEmail || '(not found)'
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
        showAutoFillBar(forms, matches);
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
      // Even without detected forms, try to find a username on the page
      const pageUser = findUsernameOnPage();
      sendResponse({
        username: pageUser,
        password: '',
        url: window.location.href,
        hostname: window.location.hostname,
      });
      return true;
    }
    const form = detectedForms[0];
    sendResponse({
      username: form.usernameField?.value || lastTypedUsername || findUsernameOnPage() || '',
      password: form.passwordField?.value || lastTypedPassword || '',
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

    // Capture credentials as the user types and persist to chrome.storage.session.
    // The background script will auto-save when the page navigates away.
    // No prompts, no banners — fully automatic.
    passwordField.addEventListener('input', () => {
      lastTypedPassword = passwordField.value;
      if (lastTypedPassword) {
        const username = usernameField?.value || lastTypedUsername || findUsernameOnPage() || '';
        console.log('[Gila] Password typed, persisting to storage. Username:', username || '(scanning page...)');
        chrome.storage.session.set({
          pendingCredential: {
            username,
            password: lastTypedPassword,
            url: window.location.href,
            hostname: window.location.hostname,
            name: document.title || window.location.hostname,
            timestamp: Date.now(),
          }
        }).catch(() => {});
      }
    });

    // Also capture on keyup (some sites don't fire input properly)
    passwordField.addEventListener('keyup', () => {
      if (passwordField.value && passwordField.value !== lastTypedPassword) {
        lastTypedPassword = passwordField.value;
        const username = usernameField?.value || lastTypedUsername || findUsernameOnPage() || '';
        chrome.storage.session.set({
          pendingCredential: {
            username,
            password: lastTypedPassword,
            url: window.location.href,
            hostname: window.location.hostname,
            name: document.title || window.location.hostname,
            timestamp: Date.now(),
          }
        }).catch(() => {});
      }
    });

    if (usernameField) {
      usernameField.addEventListener('input', () => {
        lastTypedUsername = usernameField.value;
      });
    }
  }
}

/**
 * For multi-step logins (Google, Microsoft, etc.), the username was entered
 * on a previous page. Try to find it displayed as text on the current page.
 * Looks for email-like text near the password field.
 */
function findUsernameOnPage() {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  // 1. Check specific selectors used by Google, Microsoft, etc.
  const selectors = [
    '[data-identifier]',         // Google
    '#profileIdentifier',        // Google
    '.profile-name',             // Various
    '[data-email]',              // Various
    '#headingText + div',        // Google "Hi Name" followed by email
    'div[jsname] a[aria-label]', // Google account switcher
  ];

  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel);
      if (el) {
        const text = el.textContent?.trim() || el.getAttribute('data-identifier') || el.getAttribute('data-email') || el.getAttribute('aria-label') || '';
        if (text && emailRegex.test(text)) return text.match(emailRegex)[0];
      }
    } catch {}
  }

  // 2. Scan ALL visible text on the page for an email near the password field
  const passField = document.querySelector('input[type="password"]');

  // Try the entire page body — the email is visible somewhere
  const bodyText = document.body?.innerText || '';
  const allEmails = bodyText.match(new RegExp(emailRegex.source, 'g'));
  if (allEmails && allEmails.length > 0) {
    // Return the first email found that looks like a user email (not a google.com system email)
    for (const email of allEmails) {
      if (!email.endsWith('@google.com') && !email.endsWith('@gmail.com')) return email;
    }
    // If all are google/gmail, return the first one
    return allEmails[0];
  }

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

// ===== Auto-Fill Bar =====
// Appears automatically when matching credentials are found — no need to click the extension icon.

let autoFillBarShown = false;

function showAutoFillBar(forms, credentials) {
  if (autoFillBarShown) return;
  if (document.getElementById('gila-autofill-bar')) return;
  autoFillBarShown = true;

  const bar = document.createElement('div');
  bar.id = 'gila-autofill-bar';

  // Use Shadow DOM so page CSS can't interfere
  const shadow = bar.attachShadow({ mode: 'closed' });

  const style = document.createElement('style');
  style.textContent = `
    @keyframes gilaSlideUp {
      from { transform: translateY(100%); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    @keyframes gilaFadeOut {
      from { opacity: 1; }
      to { opacity: 0; transform: translateY(10px); }
    }
    .bar {
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 2147483647;
      width: 320px;
      background: #0f0f1a;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 14px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      animation: gilaSlideUp 0.35s ease-out;
      overflow: hidden;
    }
    .bar.closing {
      animation: gilaFadeOut 0.25s ease-in forwards;
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 8px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .logo {
      width: 22px;
      height: 22px;
      background: linear-gradient(135deg, #4ade80, #22c55e);
      border-radius: 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: 800;
      color: #0f0f1a;
    }
    .title {
      font-size: 13px;
      font-weight: 600;
      color: #fff;
    }
    .close-btn {
      background: none;
      border: none;
      color: rgba(255,255,255,0.3);
      font-size: 16px;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
    }
    .close-btn:hover {
      color: rgba(255,255,255,0.6);
      background: rgba(255,255,255,0.06);
    }
    .subtitle {
      font-size: 11px;
      color: rgba(255,255,255,0.35);
      padding: 0 16px 8px;
    }
    .cred-list {
      max-height: 180px;
      overflow-y: auto;
    }
    .cred-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;
      border-top: 1px solid rgba(255,255,255,0.04);
    }
    .cred-item:hover {
      background: rgba(74, 222, 128, 0.06);
    }
    .cred-icon {
      width: 32px;
      height: 32px;
      background: rgba(74, 222, 128, 0.1);
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .cred-info {
      flex: 1;
      min-width: 0;
    }
    .cred-name {
      font-size: 13px;
      font-weight: 500;
      color: #fff;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cred-hint {
      font-size: 11px;
      color: rgba(255,255,255,0.35);
    }
    .fill-btn {
      background: rgba(74, 222, 128, 0.15);
      color: #4ade80;
      border: 1px solid rgba(74, 222, 128, 0.25);
      border-radius: 6px;
      padding: 5px 12px;
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
      transition: background 0.15s;
    }
    .fill-btn:hover {
      background: rgba(74, 222, 128, 0.25);
    }
  `;

  const container = document.createElement('div');
  container.className = 'bar';

  const header = document.createElement('div');
  header.className = 'header';
  header.innerHTML = `
    <div class="brand">
      <div class="logo">G</div>
      <span class="title">Gila</span>
    </div>
  `;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'close-btn';
  closeBtn.textContent = '\u2715';
  closeBtn.addEventListener('click', () => dismissBar(container, bar));
  header.appendChild(closeBtn);

  const subtitle = document.createElement('div');
  subtitle.className = 'subtitle';
  subtitle.textContent = credentials.length === 1
    ? 'Credential found for this site'
    : `${credentials.length} credentials found for this site`;

  const list = document.createElement('div');
  list.className = 'cred-list';

  for (const cred of credentials) {
    const item = document.createElement('div');
    item.className = 'cred-item';

    const icon = document.createElement('div');
    icon.className = 'cred-icon';
    icon.textContent = '\uD83C\uDF10';

    const info = document.createElement('div');
    info.className = 'cred-info';
    const displayName = cred.username || cred.name;
    const hintText = cred.username ? cred.name : 'Login';
    info.innerHTML = `<div class="cred-name">${escapeForHTML(displayName)}</div><div class="cred-hint">${escapeForHTML(hintText)}</div>`;

    const fillBtn = document.createElement('button');
    fillBtn.className = 'fill-btn';
    fillBtn.textContent = 'Fill';
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fillFromBar(cred.id, container, bar);
    });

    item.appendChild(icon);
    item.appendChild(info);
    item.appendChild(fillBtn);
    item.addEventListener('click', () => fillFromBar(cred.id, container, bar));
    list.appendChild(item);
  }

  container.appendChild(header);
  container.appendChild(subtitle);
  container.appendChild(list);
  shadow.appendChild(style);
  shadow.appendChild(container);

  bar.style.cssText = 'position: fixed; bottom: 0; right: 0; z-index: 2147483647;';
  document.body.appendChild(bar);

  // Auto-dismiss after 30 seconds
  setTimeout(() => {
    if (bar.parentNode) dismissBar(container, bar);
  }, 30000);
}

function fillFromBar(credId, container, bar) {
  chrome.runtime.sendMessage({ type: 'get_credential', id: credId }, (res) => {
    if (res?.result?.data) {
      fillCredential(res.result.data.username || '', res.result.data.password || '');
      dismissBar(container, bar);
    }
  });
}

function dismissBar(container, bar) {
  container.classList.add('closing');
  setTimeout(() => { if (bar.parentNode) bar.remove(); }, 250);
}
