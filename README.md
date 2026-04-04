# Gila — The Apex Vault

A high-performance, cross-platform password manager built with a "security-first, zero-knowledge" philosophy. Inspired by the macOS Passwords app, Gila gates every credential access behind a fingerprint tap or master password prompt — no credential is ever visible without explicit authentication.

**Stack:** Tauri v2 + Rust + React 19 + TypeScript + Tailwind CSS
**Platforms:** Windows, Linux, Android, iOS

---

## Features

- **Zero-Knowledge Encryption** — All encryption happens locally. Keys never leave the device.
- **Auth-Gated Access** — Every reveal, copy, edit, or delete requires re-authentication, with a 30-second grace period for batch operations.
- **Five Credential Types** — Logins, App Passwords, API Keys, Wi-Fi, and Secure Notes.
- **Password Generator** — Configurable character-based and passphrase-based generation.
- **Fuzzy Search** — Instant, debounced search across all credentials.
- **Auto-Lock** — Vault locks after 5 minutes of inactivity or on system sleep.
- **Clipboard Auto-Clear** — Copied passwords are wiped from the clipboard after 45 seconds.
- **Biometric Unlock** — OS keychain integration for password-free unlock on supported systems.
- **Dark/Light Themes** — System-native theme detection with manual override.
- **Glassmorphism UI** — Frosted glass, translucent sidebar, macOS-inspired aesthetic.

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    React Frontend                     │
│  Sidebar ─ Credential List ─ Detail Panel ─ Forms    │
│  Hooks: useCredentials, useSearch, useAuthGate, ...  │
├──────────────────── Tauri invoke ─────────────────────┤
│                    Rust Backend                       │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐           │
│  │ Commands │  │  Crypto  │  │ Database  │           │
│  │ (Tauri)  │──│ AES-GCM  │──│  SQLite   │           │
│  │          │  │ Argon2id │  │ (rusqlite)│           │
│  └─────────┘  └──────────┘  └───────────┘           │
│  ┌─────────┐  ┌──────────┐  ┌───────────┐           │
│  │  Auth   │  │Clipboard │  │ Generator │           │
│  │  State  │  │ AutoClear│  │ Pwd/Phrase│           │
│  └─────────┘  └──────────┘  └───────────┘           │
└──────────────────────────────────────────────────────┘
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

### Authentication Flow

```
Onboarding:
  Master Password → generate salt → Argon2id → encrypt verification token → store in DB

Unlock:
  Master Password → derive key from stored salt → decrypt verification token → unlock

Per-Action Auth:
  Sensitive action → check 30s grace period → if expired, prompt password/biometric

Auto-Lock:
  5 min inactivity or system sleep → lock vault → wipe key from memory
```

---

## Project Structure

```
gila/
├── src/                            # React frontend
│   ├── App.tsx                     # Screen routing (loading/onboarding/locked/main)
│   ├── main.tsx                    # React entry point
│   ├── index.css                   # Tailwind imports + dark mode config
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
│       │   ├── Sidebar.tsx        # Category navigation + theme toggle
│       │   └── DetailPanel.tsx    # Right panel container
│       ├── credentials/
│       │   ├── CredentialList.tsx  # Scrollable credential list with icons
│       │   ├── CredentialDetail.tsx# Field display with mask/reveal/copy
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
│   ├── Cargo.toml                  # Rust dependencies
│   ├── tauri.conf.json             # Tauri app configuration
│   ├── src/
│   │   ├── lib.rs                  # App setup, plugin init, command registration
│   │   ├── main.rs                 # Binary entry point
│   │   ├── state.rs                # AppState (DbPool + DerivedKey + AuthState)
│   │   ├── crypto/
│   │   │   ├── kdf.rs             # Argon2id key derivation + salt generation
│   │   │   └── cipher.rs          # AES-256-GCM encrypt/decrypt
│   │   ├── db/
│   │   │   ├── schema.rs          # SQLite schema + migrations
│   │   │   └── crud.rs            # CRUD operations for credentials
│   │   ├── auth/
│   │   │   └── mod.rs             # Lock state, inactivity timer, grace period
│   │   ├── commands/
│   │   │   ├── vault.rs           # Credential CRUD commands
│   │   │   ├── init.rs            # Vault init + password verification
│   │   │   ├── auth.rs            # Lock/unlock, request_auth, confirm_auth
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

### Build for Production

```bash
# Build distributable binary
npm run tauri build
```

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

## Credential Types

| Type | Fields | Example |
|---|---|---|
| **Login** | Service Name, URL, Username/Email, Password | Gmail, GitHub, Spotify |
| **App Password** | App Name, Generated Password, Linked Account | Gmail App Password |
| **API Key** | Service, Key, Secret (optional), Environment | Stripe, AWS, OpenAI |
| **Wi-Fi** | Network Name (SSID), Password, Security Type | Home Wi-Fi, Office |
| **Secure Note** | Title, Encrypted Text Body | Recovery codes, license keys |

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
| `unlock_vault` | Unlock with master password |
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
| `toggle_favorite` | Toggle favorite status |

### Utilities

| Command | Description |
|---|---|
| `generate_password` | Generate password (character or passphrase mode) |
| `copy_to_clipboard` | Copy to clipboard with 45s auto-clear |

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
| `tauri` | Desktop app framework |
| `argon2` | Argon2id password hashing / key derivation |
| `aes-gcm` | AES-256-GCM authenticated encryption |
| `zeroize` | Secure memory wiping |
| `rusqlite` | SQLite database (bundled) |
| `arboard` | System clipboard access |
| `keyring` | OS keychain for biometric enrollment |
| `uuid` | Unique credential IDs |
| `rand` | Cryptographic random number generation |
| `serde` / `serde_json` | Serialization |

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

---

## Implementation Phases

| Phase | Status | Description |
|---|---|---|
| **Phase 1 — Core Crypto** | Done | Argon2id + AES-GCM pipeline with integration tests |
| **Phase 2 — Desktop Shell** | Done | Full CRUD UI, search, password generator, themes |
| **Phase 3 — Biometric Gate** | Done | Lock screen, per-action auth, OS keychain integration |
| **Phase 4 — Mobile Port** | Planned | Android/iOS via Tauri v2 mobile workflows |

---

## License

This project is private and not yet licensed for distribution.
