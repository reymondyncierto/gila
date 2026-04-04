---
id: TASK-YYYY-MM-DD-###
title: Short imperative task title
domain: catalog-domain
goal: >
  Clear measurable outcome.
scope_in:
  - src/path/a
scope_out:
  - src/path/do-not-touch
constraints:
  - Keep existing API contracts unchanged.
  - No new dependencies.
  - Keep behavior backward compatible unless explicitly requested.
  - Commit messages must use `type(scope): description` with type in `feat|fix|refactor|chore|docs|test|style`.
  - Never stage or commit Codex artifacts (`AGENTS.md`, `skills/**`, `specs/**`, `CODEX*.md`, `WORKFLOW_SETUP_GUIDE.md`, `DOMAIN_SKILLS_AND_AGENTS_SETUP_GUIDE.md`, `docs/codex/**`, `scripts/codex/**`).
validation:
  - cd src-tauri && cargo build
  - npm run build
output:
  - List changed files.
  - Summarize behavior changes.
  - Note residual risks.
estimate_minutes: 30
dependencies: []
design_revision: false
collaborators: []
status: draft
---

## Context
Original user request:

## Domain Options
- vault-domain
- crypto-domain
- auth-domain
- ui-ux-frontend
- rust-backend
- database
- mixed

## Completion Criteria
- Goal satisfied.
- Validation passes.
