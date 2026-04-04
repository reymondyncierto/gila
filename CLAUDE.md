# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Gila** (from *Agila*) is a cross-platform password manager inspired by the macOS Passwords app. Every credential access (view, copy, edit) is gated behind a fingerprint tap or master password prompt. Version 1.0 is offline-only with no cloud sync.

## Tech Stack

- **Backend:** Rust (cryptographic core)
- **Desktop Framework:** Tauri v2
- **Frontend:** React 19 + TypeScript + Tailwind CSS
- **Platforms:** Windows, Linux, Android, iOS

## Architecture

### Security Model (Zero-Knowledge, Local-Only)
- **Encryption:** AES-GCM 256-bit for all stored credentials
- **Key Derivation:** Argon2id from Master Password + unique local salt
- **Memory Safety:** `zeroize` crate wipes sensitive keys from RAM after use
- **Storage:** Encrypted SQLite database (via `tauri-plugin-sql`)
- **Auth-Gated Access:** Sensitive actions require re-authentication even while unlocked, with a 30-second grace period for batch operations

### Biometrics ("Talon" Bridge)
- **Desktop:** `tauri-plugin-biometric` for Windows Hello and Linux PAM/fprintd
- **Mobile:** Tauri v2 native bridges for FaceID and Android BiometricPrompt
- Biometric unlock stores a derived session key in the OS Secure Enclave

### Frontend-Backend Communication
- All crypto operations happen in Rust; the React frontend communicates via Tauri `invoke` commands
- Passwords are always masked in the UI; revealing requires a fresh auth challenge

### Credential Types
Five entry types, each with distinct field schemas:
1. **Login** — Service Name, URL, Username/Email, Password
2. **App Password** — App Name, Generated Password, Linked Account
3. **API Key** — Service, Key, Secret (optional), Environment
4. **Wi-Fi** — SSID, Password, Security Type
5. **Secure Note** — Title, Encrypted Text Body

## Implementation Phases

1. **Phase 1 — Core Crypto:** Rust CLI that encrypts/decrypts using Argon2id + AES-GCM
2. **Phase 2 — Desktop Shell:** Tauri app with basic UI and local SQLite storage
3. **Phase 3 — Biometric Gate:** Windows Hello and Linux fingerprint integration
4. **Phase 4 — Mobile Port:** Android/iOS via Tauri v2 mobile workflows

## Commands

```bash
# Frontend
npm install
npm run dev                   # Vite dev server with hot reload
npm run build                 # Production build

# Rust Backend
cd src-tauri
cargo build                   # Compile Rust backend
cargo test                    # Run Rust tests
cargo clippy                  # Lint Rust code
cargo fmt                     # Format Rust code

# Tauri
npm run tauri dev             # Run Tauri app in dev mode
npm run tauri build           # Build distributable binary
```

## Key Constraints

- No cloud sync in v1.0
- Binary size target: < 15MB, RAM usage: < 80MB
- Auto-lock on system sleep or after 5 minutes of inactivity
- Clipboard auto-clears after 45 seconds
- Never stage or commit codex artifacts (`AGENTS.md`, `skills/**`, `specs/**`, `CODEX*.md`)

## Planned Rust Crates

- `aes-gcm` — authenticated encryption
- `argon2` — password hashing / key derivation
- `zeroize` — secure memory wiping
- `tauri-plugin-sql` — encrypted SQLite storage
- `tauri-plugin-biometric` — biometric authentication

## Workflow (STRICTLY ENFORCED — FOLLOW EVERY CONVERSATION)

This workflow is MANDATORY. Every new conversation MUST follow these steps exactly. No shortcuts, no skipping steps.

### When the user asks to implement a spec:
1. Read the spec file from `specs/`.
2. Verify `status: approved`. If not approved, stop and ask the user.
3. Set `status: in_progress` in the spec file.
4. Route to the correct specialist(s) based on `domain` (see Domain Routing below).
5. If `design_revision: true`, also invoke `ui-ux-frontend-specialist`.
6. Implement within `scope_in` and owned paths only.
7. Run validation from the spec (default: `cd src-tauri && cargo build` and/or `npm run build`).
8. If validation fails: fix the issue and re-validate. Do NOT proceed until validation passes.
9. **COMMIT immediately** using `type(scope): description` format. Stage ALL related changes: application files, CLAUDE.md updates, `.claude/agents/` modifications, and the spec file deletion. Use explicit `git add`.
10. **DELETE the completed spec file** from `specs/` (include the deletion in the same commit).
11. Only then may you proceed to the next spec or respond to the user.

### When the user asks for a new feature/change (no existing spec):
1. Decompose via `task-architect-specialist` into `specs/*.spec.md` files.
2. Each spec must be `<= 30` minutes.
3. Set `status: draft` on all new specs.
4. Present specs to the user for review.
5. Only `status: approved` specs can be executed.

### Completion sequence (steps 9-10) is NON-NEGOTIABLE:
```
Validation passes → Commit → Delete spec → Done
```
Never skip the commit. Never skip the spec deletion. Never start the next spec before completing these steps.

## Spec Rules

- Format: Markdown + YAML front matter (`*.spec.md`)
- Required fields: `id`, `title`, `domain`, `goal`, `scope_in`, `scope_out`, `constraints`, `validation`, `output`, `estimate_minutes`, `status`, `dependencies`, `design_revision`, `collaborators`
- Status lifecycle: `draft -> approved -> in_progress -> done|blocked`

## Domain Routing

| Domain | Agent |
|--------|-------|
| `vault-domain` | `vault-domain-specialist` |
| `crypto-domain` | `crypto-domain-specialist` |
| `auth-domain` | `auth-domain-specialist` |

### General Specialist Routing

| Domain | Agent |
|--------|-------|
| `ui-ux-frontend` | `ui-ux-frontend-specialist` |
| `rust-backend` | `rust-backend-specialist` |
| `database` | `database-specialist` |

### Orchestration Agents

| Agent | Purpose |
|-------|---------|
| `task-architect-specialist` | Decomposes requests into spec files; never implements code |
| `agent-router` | Routes approved specs to correct specialist(s); never implements code |

## Collaboration Model

- **Domain specialists** own business logic and feature behavior for their domain.
- **General specialists** own quality and correctness of their respective layer:
  - `ui-ux-frontend-specialist` — design consistency, accessibility, responsiveness, glassmorphism aesthetic
  - `rust-backend-specialist` — Tauri command design, service patterns, plugin integration
  - `database-specialist` — encrypted SQLite schema, migrations, query correctness
  - `crypto-domain-specialist` — encryption algorithms, key lifecycle, secure memory
- Domain specialists collaborate with general specialists when a spec crosses layers.
- `design_revision: true` triggers collaboration with `ui-ux-frontend-specialist`.

## Validation Policy

- Non-trivial changes must run the validation command specified in the spec.
- If verification fails, do not mark done and do not delete spec.

## Commit Policy (MANDATORY)

- **Every completed spec MUST be committed immediately after validation passes.** Do not move to the next spec without committing first. This is non-negotiable.
- Commit format is strict: `type(scope): description`.
- Allowed `type` values: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`.
- `scope` is required and should identify the affected feature/module.
- No AI attribution or co-author trailers.
- **Include ALL changes in the commit**: application code, CLAUDE.md updates, `.claude/agents/` modifications, and spec file deletions. Everything goes in one commit per spec.
- Use explicit file staging only (`git add <file1> <file2> ...`), never broad staging (`git add .`, `git add -A`).

## Safety Rules

- No destructive git commands unless explicitly requested.
- Do not revert unrelated local changes.
- Stop and escalate if requirements are ambiguous.
