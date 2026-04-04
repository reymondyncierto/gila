# PRD: Gila — The Apex Vault
**Project Name:** Gila (from *Agila*)
**Version:** 1.0 (2026 Release)
**Stack:** Tauri v2 + Rust + React/Tailwind
**Target Platforms:** Windows, Linux, Android, iOS

---

## 1. Executive Summary
**Gila** is a high-performance, cross-platform password manager built with a "security-first, zero-knowledge" philosophy. Inspired by the macOS Passwords app, Gila gates every access behind a **fingerprint tap or master password prompt**—no credential is ever visible without explicit authentication. It allows users to manage all sensitive credentials (email passwords, app-specific passwords, API keys, Wi-Fi keys, secure notes) through a clean, native-feeling interface.

---

## 2. Core Pillars
* **Apex Security:** All encryption happens locally. Keys never leave the device.
* **Auth-Gated Access:** Every credential view, copy, or edit requires a fresh biometric tap or master password entry—mirroring the macOS Passwords workflow.
* **Biometric-First:** Seamless integration with Windows Hello, Linux Fingerprint (fprintd), and Mobile Biometrics.
* **Featherweight:** Leveraging Tauri v2 to maintain a binary size < 15MB and RAM usage < 80MB.
* **Memory Safety:** Critical cryptographic logic is written in safe Rust to prevent memory-leak vulnerabilities.

---

## 3. Technical Requirements

### 3.1 Backend (Rust)
* **Encryption:** `aes-gcm` (256-bit) for authenticated data encryption.
* **Key Derivation:** `argon2id` for hashing the Master Password with high memory-hard costs.
* **Secure Memory:** Use the `zeroize` crate to ensure sensitive keys are wiped from RAM immediately after use.
* **Storage:** Encrypted SQLite database via `tauri-plugin-sql` or a flat-file encrypted vault.

### 3.2 Frontend (React/TypeScript)
* **Framework:** React 19 + Tailwind CSS for a "Glassmorphism" / macOS-inspired UI.
* **Communication:** Tauri `invoke` commands to trigger Rust-based encryption/decryption.

### 3.3 Biometrics (The "Talon" Bridge)
* **Desktop:** Integration via `tauri-plugin-biometric` for Windows Hello and Linux PAM.
* **Mobile:** Native Swift/Kotlin bridges provided by Tauri v2 for FaceID and Android BiometricPrompt.

---

## 4. Functional Requirements

### 4.1 Onboarding & Setup
* User creates a **Master Password**.
* App generates a unique local Salt for Argon2id.
* Optional: Enable Biometric Unlock (stores a derived session key in the OS Secure Enclave).

### 4.2 Credential Types
| Type | Fields | Example |
| :--- | :--- | :--- |
| **Login** | Service Name, URL, Username/Email, Password | Gmail, Spotify, GitHub |
| **App Password** | App Name, Generated Password, Linked Account | Gmail App Password, Slack Token |
| **API Key** | Service, Key, Secret (optional), Environment | Stripe, AWS, OpenAI |
| **Wi-Fi** | Network Name (SSID), Password, Security Type | Home Wi-Fi, Office |
| **Secure Note** | Title, Encrypted Text Body | Recovery codes, license keys |

### 4.3 Vault Operations
* **Create Entry:** Templated form based on credential type above.
* **View/Reveal:** Passwords are masked by default. Revealing requires a biometric tap or master password re-entry.
* **Search:** Instant, fuzzy-search filtering of the vault.
* **Copy & Clear:** Copy password to clipboard with an automatic 45-second clear timer.
* **Password Generator:** Built-in generator with configurable length, character sets, and passphrase mode.

### 4.4 Lock & Authentication State
* App auto-locks on system sleep or after 5 minutes of inactivity.
* Unlocking requires a biometric "tap" or the Master Password.
* **Per-action auth:** Sensitive actions (reveal, copy, edit, delete) require re-authentication even while unlocked—matching macOS Passwords behavior.
* **Session grace period:** After a successful auth, skip re-prompting for 30 seconds to allow batch operations.

---

## 5. User Interface (UI) Design
* **Layout:** Sidebar for categories (All, Logins, App Passwords, API Keys, Wi-Fi, Secure Notes, Favorites).
* **Detail Panel:** Selecting an entry shows metadata (service, username, date added) but keeps the password masked until authenticated.
* **Themes:** System-native Dark/Light mode support.
* **Feedback:** Haptic feedback on mobile for successful biometric scans.

---

## 6. Implementation Roadmap

| Phase | Task | Deliverable |
| :--- | :--- | :--- |
| **Phase 1** | **Core Crypto** | Rust CLI that encrypts/decrypts a JSON file using Argon2id + AES-GCM. |
| **Phase 2** | **Desktop Shell** | Tauri Windows/Linux app with basic UI and local SQLite storage. |
| **Phase 3** | **Biometric Gate** | Integration of Windows Hello and Linux fingerprint prompts. |
| **Phase 4** | **Mobile Port** | Compiling for Android/iOS using Tauri v2 mobile workflows. |

---

## 7. Security Warnings (Internal)
* **No Cloud:** Version 1.0 does not include cloud sync to avoid handling user data.
* **Backup:** Users must be prompted to export an "Emergency Recovery Kit" (PDF/Text) containing their Master Password.
