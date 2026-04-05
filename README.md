# Gila — The Apex Vault

A high-performance, cross-platform password manager built with a "security-first, zero-knowledge" philosophy. Inspired by the macOS Passwords app, Gila gates every credential access behind a fingerprint tap or master password prompt — no credential is ever visible without explicit authentication.

**Stack:** Tauri v2 + Rust + React 19 + TypeScript + Tailwind CSS
**Platforms:** Windows, Linux, Android, iOS
**Browser Extension:** Chrome / Edge / Brave (Manifest V3)

---

## Features

- **Zero-Knowledge Encryption** — All encryption happens locally. Keys never leave the device.
- **Auth-Gated Access** — Every reveal, copy, edit, or delete requires re-authentication, with a 30-second grace period for batch operations.
- **Five Credential Types** — Logins, App Passwords, API Keys, Wi-Fi, and Secure Notes.
- **Browser Extension** — Auto-detects login forms, auto-fills saved credentials, and offers to save new ones.
- **Password Generator** — Configurable character-based and passphrase-based generation.
- **Fuzzy Search** — Instant, debounced search across all credentials.
- **Auto-Lock** — Vault locks after 5 minutes of inactivity or on system sleep.
- **Clipboard Auto-Clear** — Copied passwords are wiped from the clipboard after 45 seconds.
- **Biometric Unlock** — OS keychain integration for password-free unlock on supported systems.
- **System Tray** — App runs in the background; closing the window hides to tray instead of quitting. Bridge stays alive for the browser extension.
- **Save While Locked** — Credentials saved from the browser extension while the vault is locked are queued in memory and encrypted/stored once the user unlocks.
- **Autostart** — Starts silently in the system tray on login via XDG autostart.
- **Light Blue Theme** — Clean, minimal UI with sky-blue accents, SVG icons, and Apple Passwords-inspired layout.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Browser Extension                          │
│  Content Script ─ Background Worker ─ Popup UI                  │
│  Form detection, auto-fill, save prompt, inline suggestions     │
├──── fetch http://127.0.0.1:21525 ──── ws://127.0.0.1:{port} ───┤
│                                                                 │
│                       Gila Desktop App                          │
│                                                                 │
│  ┌──────────────────── React Frontend ────────────────────────┐ │
│  │  Sidebar ─ Credential List ─ Detail Panel ─ Forms ─ Toast  │ │
│  │  Hooks: useCredentials, useSearch, useAuthGate, useTheme   │ │
│  ├──────────────────── Tauri invoke ──────────────────────────┤ │
│  │                     Rust Backend                           │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │ │
│  │  │Commands │  │  Crypto  │  │ Database │  │  Bridge   │  │ │
│  │  │ (Tauri) │  │ AES-GCM  │  │  SQLite  │  │ WS Server │  │ │
│  │  │         │  │ Argon2id │  │(rusqlite)│  │ HTTP Disc │  │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └───────────┘  │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │ │
│  │  │  Auth   │  │Clipboard │  │Generator │  │Sys. Tray  │  │ │
│  │  │  State  │  │ AutoClear│  │Pwd/Phrase│  │ + Menu    │  │ │
│  │  └─────────┘  └──────────┘  └──────────┘  └───────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Security Model

| Layer | Implementation |
|---|---|
| **Encryption** | AES-256-GCM with random 12-byte nonce per encryption |
| **Key Derivation** | Argon2id (19 MiB memory, 2 iterations, 1 parallelism) |
| **Memory Safety** | `zeroize` crate wipes keys from RAM via `ZeroizeOnDrop` |
| **Storage** | Encrypted SQLite — credential data stored as ciphertext blobs |
| **Auth Gating** | Per-action re-authentication with 30-second grace period |
| **Biometric** | OS keychain (via `keyring` crate) stores session credential |
| **Bridge Security** | WebSocket auth token required; discovery bound to 127.0.0.1 only |

### Authentication Flow

```
Onboarding:
  Master Password -> generate salt -> Argon2id -> encrypt verification token -> store in DB

Unlock:
  Master Password -> derive key from stored salt -> decrypt verification token -> unlock

Per-Action Auth:
  Sensitive action -> check 30s grace period -> if expired, prompt password/biometric

Auto-Lock:
  5 min inactivity or system sleep -> lock vault -> wipe key from memory
```

---

## System Tray

Gila runs as a background service in the system tray. The window is hidden on startup — the WebSocket bridge starts immediately so the browser extension can connect.

### Tray Menu

| Action | Behavior |
|---|---|
| **Open Gila** | Shows the window and reloads the frontend |
| **Lock Vault** | Locks the vault, wipes the key, and shows the lock screen |
| **Quit** | Fully exits the app (only way to stop the background process) |

### Window Behavior

- **Close (X button)** — Hides the window to tray; app keeps running
- **Double-click tray icon** — Restores the window
- **Extension "Open Gila" button** — Sends a `focus_app` command via the bridge to show and focus the window

### Autostart

On Linux, an XDG autostart entry starts the dev environment on login:

```
~/.config/autostart/gila.desktop → scripts/start-dev.sh → npm run tauri dev
```

The `scripts/start-dev.sh` script sets up PATH (nvm + cargo) and runs the Tauri dev server in the background. Logs are written to `/tmp/gila-dev.log`.

---

## Save While Locked

When the vault is locked, the browser extension can still save credentials. They are queued in memory and encrypted/stored once the user unlocks.

### Flow

1. Extension detects a form submission and sends `save_credential` to the bridge
2. Bridge detects the vault is locked, queues the credential as a `PendingCredential` in memory
3. Bridge returns `{"result": {"name": "...", "queued": true}}`
4. Extension shows a **"Credential queued — Gila is locked"** banner with an **"Open Gila"** button
5. User opens Gila and unlocks the vault
6. `unlock_vault` processes the pending queue — encrypts each credential and saves to the database

### Locked-Page Detection

When the extension detects a login form but the vault is locked, it shows a bottom-right popup:
- "Gila is locked — Unlock your vault to autofill credentials on this page"
- **"Open Gila & Unlock"** button focuses the app window via the bridge

### What's Blocked When Locked

| Operation | Behavior |
|---|---|
| **Autofill lookup** | Blocked — returns `vault_locked` |
| **Get credential** | Blocked — returns `vault_locked` |
| **Save credential** | Queued — saved on unlock |
| **List/search metadata** | Allowed — no decryption needed |

---

## Browser Extension

The Gila browser extension integrates directly with the desktop app to auto-detect login forms, auto-fill saved credentials, and offer to save new ones — all without any manual configuration.

### How It Works

```
                         Browser
┌──────────────────────────────────────────┐
│                                          │
│  Content Script (every page)             │
│  ├─ Detects login forms (heuristics      │
│  │  + MutationObserver for SPAs)         │
│  ├─ Shows inline "G" icon in fields      │
│  │  when matching credentials exist      │
│  ├─ Auto-fills username + password       │
│  │  (React/Angular/Vue compatible)       │
│  └─ Detects form submissions and         │
│     shows "Save to Gila?" banner         │
│                                          │
│  Background Service Worker               │
│  ├─ Auto-discovers Gila via HTTP         │     HTTP (fixed port 21525)
│  │  GET http://127.0.0.1:21525/config ───┼──────────────────────┐
│  │  Returns { port, token }              │                      │
│  ├─ Connects via WebSocket               │     WebSocket        │
│  │  ws://127.0.0.1:{port} ──────────────┼───────────────┐      │
│  └─ Relays messages between              │               │      │
│     content scripts and Gila             │               │      │
│                                          │               │      │
│  Popup UI                                │               │      │
│  ├─ Shows matching credentials           │               │      │
│  │  for the current tab's URL            │               │      │
│  ├─ Click to auto-fill                   │               │      │
│  └─ Reconnect button + manual config     │               │      │
│                                          │               │      │
└──────────────────────────────────────────┘               │      │
                                                           │      │
                       Gila Desktop App                    │      │
┌──────────────────────────────────────────────────────────┼──────┼─┐
│                                                          │      │ │
│  Bridge Module (Rust)                                    │      │ │
│  ├─ HTTP Discovery Server (port 21525) ◄─────────────────┼──────┘ │
│  │  Returns WS port + auth token                         │        │
│  ├─ WebSocket Server (random port) ◄─────────────────────┘        │
│  │  JSON-RPC protocol:                                            │
│  │  ├─ auth      — authenticate with token                        │
│  │  ├─ lookup    — find credentials by URL (blocked if locked)    │
│  │  ├─ get_credential — decrypt and return (blocked if locked)    │
│  │  ├─ save_credential — encrypt and store (queued if locked)     │
│  │  ├─ focus_app — show and focus the app window                  │
│  │  └─ status    — check vault lock state                         │
│  └─ Credential saves are queued when locked, processed on unlock  │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

### Zero-Config Auto-Connect

The extension connects to the desktop app automatically — no manual setup required:

1. **Gila desktop app starts** and launches two local servers:
   - **HTTP discovery** on fixed port `21525` (returns WS port + auth token)
   - **WebSocket bridge** on a random port (for credential operations)

2. **Extension background worker** fetches `http://127.0.0.1:21525/config` on startup to discover the WebSocket port and auth token.

3. **If Gila restarts** (new port), the extension re-discovers automatically every 15 seconds.

4. **Fallback**: if auto-discovery fails, the popup has a manual config section where you can enter the port and token from `~/.gila/bridge.port` and `~/.gila/bridge.token`.

### Form Detection

The content script detects login forms using multiple heuristics:

| Signal | Examples |
|---|---|
| **Input type** | `<input type="password">`, `<input type="email">` |
| **Autocomplete attribute** | `autocomplete="username"`, `autocomplete="current-password"` |
| **Name/ID heuristics** | `name="user"`, `id="email"`, `name="passwd"` |
| **Aria labels** | `aria-label="Email address"` |
| **Dynamic forms** | `MutationObserver` watches for forms injected by SPAs |

The detector finds password fields first, then walks backwards in the DOM to find the associated username/email field.

### Auto-Fill

When a user selects a credential (from the popup or the inline dropdown), the extension fills both the username and password fields:

- Uses the **native HTMLInputElement value setter** to bypass React's controlled input interception
- Dispatches `InputEvent` with `inputType: 'insertText'` for React compatibility
- Fires `input`, `change`, and `blur` events so Angular/Vue also pick up the changes
- Briefly highlights filled fields with a green outline for visual confirmation

### Save Detection

When a user submits a login form with credentials not already in the vault:

1. The content script intercepts the `submit` event
2. Captures the username and password values
3. Checks the vault for existing credentials for this URL
4. If new, saves the credential directly to the desktop app
5. If the vault is locked, queues the credential and shows a "Gila is locked" banner
6. The desktop app shows a toast notification confirming the save

### Inline Suggestions

When a login form is detected and matching credentials exist in the vault:

- A small **"G" icon** appears inside the username and password fields
- Clicking the icon opens a **Shadow DOM dropdown** listing matching credentials
- Selecting a credential fills both fields instantly
- The dropdown uses Shadow DOM to prevent CSS conflicts with the host page
- Dismisses on outside click or Escape key

---

## Project Structure

```
gila/
├── src/                            # React frontend
│   ├── App.tsx                     # Screen routing (loading/onboarding/locked/main)
│   ├── main.tsx                    # React entry point
│   ├── index.css                   # Tailwind + custom scrollbar/input styling
│   ├── types/
│   │   └── credentials.ts         # TypeScript types for all credential schemas
│   ├── hooks/
│   │   ├── useCredentials.ts      # Fetch & filter credentials by category
│   │   ├── useSearch.ts           # Debounced fuzzy search (300ms)
│   │   ├── useAuthGate.ts         # Wraps actions with re-auth check
│   │   └── useTheme.ts           # Dark/light/system theme management
│   ├── pages/
│   │   ├── Onboarding.tsx         # Master password creation
│   │   └── LockScreen.tsx         # Vault unlock (password + biometric)
│   └── components/
│       ├── layout/
│       │   ├── AppLayout.tsx      # Main 3-panel layout with state management
│       │   ├── Sidebar.tsx        # Category navigation with SVG icons
│       │   ├── DetailPanel.tsx    # Right panel container
│       │   └── Toast.tsx          # Toast notification for browser-saved creds
│       ├── credentials/
│       │   ├── CredentialList.tsx  # Scrollable credential list with icon badges
│       │   ├── CredentialDetail.tsx# Centered detail with hover-to-reveal actions
│       │   └── DeleteDialog.tsx   # Confirmation modal for deletion
│       ├── forms/
│       │   └── CredentialForm.tsx # Dynamic create/edit form per type
│       ├── generator/
│       │   └── PasswordGenerator.tsx # Character + passphrase generator UI
│       ├── auth/
│       │   └── AuthPrompt.tsx     # Re-auth modal for sensitive actions
│       └── onboarding/
│           └── PasswordStrength.tsx# 5-level password strength meter
│
├── src-tauri/                      # Rust backend
│   ├── Cargo.toml                  # Rust dependencies (includes tray-icon feature)
│   ├── tauri.conf.json             # Tauri config (window starts hidden)
│   ├── src/
│   │   ├── lib.rs                  # App setup, tray menu, window management
│   │   ├── main.rs                 # Binary entry point
│   │   ├── state.rs                # AppState (DB + Key + Auth + PendingCredentials + AppHandle)
│   │   ├── crypto/
│   │   │   ├── kdf.rs             # Argon2id key derivation + salt generation
│   │   │   └── cipher.rs          # AES-256-GCM encrypt/decrypt
│   │   ├── db/
│   │   │   ├── schema.rs          # SQLite schema + migrations
│   │   │   └── crud.rs            # CRUD + URL-based credential matching
│   │   ├── auth/
│   │   │   └── mod.rs             # Lock state, inactivity timer, grace period
│   │   ├── bridge/
│   │   │   └── mod.rs             # WebSocket server + HTTP discovery + focus_app
│   │   ├── commands/
│   │   │   ├── vault.rs           # Credential CRUD + URL lookup commands
│   │   │   ├── init.rs            # Vault init + password verification
│   │   │   ├── auth.rs            # Lock/unlock + pending credential processing
│   │   │   ├── biometric.rs       # Keychain-based biometric enrollment/unlock
│   │   │   ├── clipboard.rs       # Copy with 45s auto-clear
│   │   │   └── generator.rs       # Password generation command
│   │   ├── generator/
│   │   │   └── mod.rs             # Character + passphrase generation logic
│   │   └── clipboard/
│   │       └── mod.rs             # Clipboard management with timer invalidation
│   └── tests/
│       └── crypto_integration.rs   # End-to-end crypto pipeline tests
│
├── browser-extension/              # Chrome browser extension (Manifest V3)
│   ├── manifest.json               # Extension manifest
│   ├── popup.html                  # Popup UI shell
│   ├── popup.css                   # Popup styling
│   ├── icons/                      # Extension icons (16/48/128 PNG)
│   ├── test-page.html              # Test login page for development
│   ├── native-host/                # Native messaging host (optional fallback)
│   │   ├── gila_bridge_host.py     # Python host script
│   │   └── com.rpyncierto.gila.json # Host manifest
│   ├── install-native-host.sh      # Native host installer (optional)
│   └── src/
│       ├── background.js           # Service worker — discovery + message routing + focus_app
│       ├── bridge.js               # WebSocket client with reconnection
│       ├── content.js              # Form detection + auto-fill + save/locked/queued banners
│       ├── content.css             # Content script styles
│       ├── popup.js                # Popup logic — credential listing + fill trigger
│       ├── autofill.js             # Framework-compatible input value setter
│       ├── detector.js             # Form detection heuristics (reference module)
│       ├── save-prompt.js          # Save banner UI (reference module)
│       └── inline-suggest.js       # Inline icon + Shadow DOM dropdown (reference module)
│
├── scripts/
│   └── start-dev.sh               # Autostart script — runs npm run tauri dev in background
│
├── PRD.md                          # Product Requirements Document
├── CLAUDE.md                       # Claude Code project guidance
└── README.md                       # This file
```

---

## Prerequisites

- **Rust** (1.70+) — Install via [rustup](https://rustup.rs/)
- **Node.js** (18+) and npm
- **System libraries** (Linux):
  ```bash
  sudo apt install libwebkit2gtk-4.1-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev libsoup-3.0-dev libjavascriptcoregtk-4.1-dev build-essential pkg-config
  ```
- **Chrome/Edge/Brave** (for browser extension)

---

## Getting Started

### Install Dependencies

```bash
# Frontend
npm install

# Rust dependencies are fetched automatically on first build
```

### Development

```bash
# Run the Tauri app in development mode (hot reload)
npm run tauri dev

# Or run frontend and backend separately:
npm run dev              # Vite dev server on http://localhost:1420
cd src-tauri && cargo build  # Rust backend
```

The app starts hidden in the system tray. Double-click the tray icon or use the tray menu to open the window.

### Build & Install

Build the production packages:

```bash
npm run tauri build
```

This produces three installable packages in `src-tauri/target/release/bundle/`:

| File | Format | Install | Uninstall |
|---|---|---|---|
| `bundle/deb/Gila_0.1.0_amd64.deb` | Ubuntu / Debian | `sudo dpkg -i Gila_0.1.0_amd64.deb` | `sudo dpkg -r gila` |
| `bundle/rpm/Gila-0.1.0-1.x86_64.rpm` | Fedora / RHEL | `sudo rpm -i Gila-0.1.0-1.x86_64.rpm` | `sudo rpm -e gila` |
| `bundle/appimage/Gila_0.1.0_amd64.AppImage` | Any Linux | `chmod +x Gila_*.AppImage && ./Gila_*.AppImage` | Just delete the file |

On install (.deb/.rpm), a `postinst` script automatically creates an XDG autostart entry at `~/.config/autostart/gila.desktop` so the app starts silently in the system tray on login. On uninstall, a `prerm` script removes it.

### Run Tests

```bash
# Rust unit + integration tests
cd src-tauri && cargo test

# Lint Rust code
cd src-tauri && cargo clippy

# Format Rust code
cd src-tauri && cargo fmt

# TypeScript type checking
npx tsc --noEmit

# Frontend production build (includes type check)
npm run build
```

---

## Browser Extension Setup

### Loading the Extension

1. Open `chrome://extensions` in Chrome, Edge, or Brave
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select the `browser-extension/` folder
5. The Gila extension icon appears in the toolbar

### Connecting to the Desktop App

The extension auto-connects when both the extension and the Gila desktop app are running:

1. Start the Gila desktop app: `npm run tauri dev`
2. Create your master password (first run) and unlock the vault
3. The extension background worker auto-discovers the bridge via `http://127.0.0.1:21525/config`
4. Click the Gila extension icon — it should show **"Connected to Gila"**

If it shows "Not connected", click **Reconnect to Gila** or use the manual config section in the popup (port from `~/.gila/bridge.port`, token from `~/.gila/bridge.token`).

### Testing with the Test Page

A test login page is included for development:

1. Open `browser-extension/test-page.html` in the browser
2. **Test save detection:** Type an email and password, click "Sign In" — the credential is saved to Gila
3. **Test auto-fill:** After saving, refresh the page — the "G" icon appears in the fields, click it to auto-fill
4. **Test popup:** Click the Gila extension icon — matching credentials appear, click to fill

---

## Bridge Protocol

The desktop app exposes a local WebSocket server for the browser extension. Communication uses a JSON-RPC-style protocol.

### Discovery

```
GET http://127.0.0.1:21525/config

Response:
{ "port": 46867, "token": "abc123..." }
```

### WebSocket Messages

All messages are JSON. The first message must be `auth`:

```json
// Authenticate
-> { "method": "auth", "token": "abc123..." }
<- { "result": "authenticated" }

// Lookup credentials by URL (blocked when locked)
-> { "method": "lookup", "url": "https://github.com/login" }
<- { "result": [{ "id": "...", "name": "GitHub", "cred_type": "login" }] }

// Get decrypted credential (blocked when locked)
-> { "method": "get_credential", "id": "uuid-here" }
<- { "result": { "id": "...", "name": "GitHub", "data": { "username": "...", "password": "..." } } }

// Save credential (queued when locked, saved on unlock)
-> { "method": "save_credential", "name": "GitHub", "url": "https://github.com", "username": "user", "password": "pass" }
<- { "result": { "id": "new-uuid", "name": "GitHub" } }
// or when locked:
<- { "result": { "name": "GitHub", "queued": true } }

// Focus the app window (show + reload if needed)
-> { "method": "focus_app" }
<- { "result": "ok" }

// Check vault status
-> { "method": "status" }
<- { "result": { "locked": false } }
```

---

## Tauri Commands (IPC API)

All frontend-backend communication happens through Tauri `invoke` commands:

### Vault Lifecycle

| Command | Description |
|---|---|
| `is_vault_setup` | Check if vault has been initialized |
| `initialize_vault` | Create vault with master password (first run) |
| `verify_master_password` | Verify master password and derive key |

### Auth & Lock

| Command | Description |
|---|---|
| `get_lock_state` | Get current lock state + check auto-lock |
| `lock_vault` | Lock the vault and wipe key from memory |
| `unlock_vault` | Unlock with master password + process pending credentials |
| `touch_activity` | Reset inactivity timer |
| `request_auth` | Check if within 30s grace period |
| `confirm_auth` | Re-authenticate for sensitive action |

### Biometric

| Command | Description |
|---|---|
| `check_biometric_status` | Check if biometrics are available/enrolled |
| `enroll_biometric` | Store credentials in OS keychain |
| `biometric_unlock` | Unlock vault via keychain |
| `biometric_confirm_auth` | Per-action auth via keychain |
| `remove_biometric` | Remove keychain enrollment |

### Credentials

| Command | Description |
|---|---|
| `create_credential` | Encrypt and store a new credential |
| `update_credential` | Re-encrypt and update an existing credential |
| `delete_credential` | Delete a credential by ID |
| `list_credentials` | List credentials (metadata only, no secrets) |
| `get_credential` | Decrypt and return full credential data |
| `search_credentials` | Fuzzy search by name and metadata |
| `match_credentials_by_url` | Find login credentials matching a URL's domain |
| `toggle_favorite` | Toggle favorite status |

### Utilities

| Command | Description |
|---|---|
| `generate_password` | Generate password (character or passphrase mode) |
| `copy_to_clipboard` | Copy to clipboard with 45s auto-clear |

---

## Credential Types

| Type | Fields | Example |
|---|---|---|
| **Login** | Service Name, URL, Username/Email, Password | Gmail, GitHub, Spotify |
| **App Password** | App Name, Generated Password, Linked Account | Gmail App Password |
| **API Key** | Service, Key, Secret (optional), Environment | Stripe, AWS, OpenAI |
| **Wi-Fi** | Network Name (SSID), Password, Security Type | Home Wi-Fi, Office |
| **Secure Note** | Title, Encrypted Text Body | Recovery codes, license keys |

---

## Database Schema

```sql
-- Master password salt and encrypted verification token
CREATE TABLE vault_meta (
    key   TEXT PRIMARY KEY,
    value BLOB NOT NULL
);

-- All credential entries (encrypted data blob per entry)
CREATE TABLE credentials (
    id           TEXT PRIMARY KEY,
    cred_type    TEXT NOT NULL CHECK(cred_type IN ('login','app_password','api_key','wifi','secure_note')),
    name         TEXT NOT NULL,
    search_index TEXT NOT NULL DEFAULT '',
    data         BLOB NOT NULL,          -- AES-GCM encrypted JSON
    favorite     INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
```

The `data` column stores `nonce(12 bytes) || ciphertext || tag(16 bytes)` — the output of AES-256-GCM encryption of a JSON string containing the credential fields.

---

## Key Dependencies

### Rust

| Crate | Purpose |
|---|---|
| `tauri` | Desktop app framework (with `tray-icon` and `image-png` features) |
| `argon2` | Argon2id password hashing / key derivation |
| `aes-gcm` | AES-256-GCM authenticated encryption |
| `zeroize` | Secure memory wiping |
| `rusqlite` | SQLite database (bundled) |
| `arboard` | System clipboard access |
| `keyring` | OS keychain for biometric enrollment |
| `tokio` + `tokio-tungstenite` | Async runtime + WebSocket server for bridge |
| `uuid` | Unique credential IDs |
| `rand` | Cryptographic random number generation |
| `serde` / `serde_json` | Serialization |
| `hex` / `dirs` | Token encoding / home directory resolution |

### Frontend

| Package | Purpose |
|---|---|
| `react` / `react-dom` | UI framework |
| `@tauri-apps/api` | Tauri IPC (invoke commands) |
| `tailwindcss` | Utility-first CSS |
| `typescript` | Type safety |
| `vite` | Build tool with HMR |

---

## Design Constraints

- **No cloud sync** in v1.0 — all data stays on device
- **Binary size target:** < 15 MB
- **RAM usage target:** < 80 MB
- **Auto-lock:** 5 minutes of inactivity or system sleep
- **Clipboard clear:** 45 seconds after copy
- **Auth grace period:** 30 seconds between re-prompts
- **Bridge security:** WebSocket bound to 127.0.0.1 only, auth token required

---

## Implementation Phases

| Phase | Status | Description |
|---|---|---|
| **Phase 1 — Core Crypto** | Done | Argon2id + AES-GCM pipeline with integration tests |
| **Phase 2 — Desktop Shell** | Done | Full CRUD UI, search, password generator, themes |
| **Phase 3 — Biometric Gate** | Done | Lock screen, per-action auth, OS keychain integration |
| **Phase 4 — Browser Extension** | Done | Form detection, auto-fill, save detection, inline suggestions |
| **Phase 5 — System Tray & UX** | Done | Background tray, save-while-locked queue, autostart, light blue redesign |
| **Phase 6 — Mobile Port** | Planned | Android/iOS via Tauri v2 mobile workflows |

---

## License

This project is private and not yet licensed for distribution.
