# GEMINI.md - Guidelines for The Hype

Welcome to **The Hype** (forked from openGym). The Hype is a self-hosted, privacy-first gym tracker and workout companion built around an energetic, personalized AI "Hype Man / Hype Woman" coach that hypes users up, celebrates their PRs, and keeps them consistent.

---

## Architecture & Conventions

### 1. Frontend (`frontend/src`)
- **State Management**:
  - `store/useStore.js`: Single Zustand store holding persisted client state (`localStorage.gym_state_v1`), debounce-pushed to the server via `lib/api.js`.
  - `store/useUI.js`: Ephemeral UI state (active modal, sheet, navigation).
  - State updates must always be immutable.
- **Domain Logic (`lib/`)**:
  - Pure, framework-free helpers (e.g. `progression.js`, `onerm.js`, `finish-workout.js`).
  - **CRITICAL**: Any function deciding progression, calculating 1RM, or computing session metrics must live in `lib/` and have a paired `*.test.js` beside it.
- **Mobile (`@capacitor/*`)**:
  - Native features (storage mirror, notifications, wake lock) are gated behind the `MOBILE` flag in `lib/mobile.js`.

### 2. Backend (`api/server.js`)
- Single-file Node HTTP server (no express/fastify; plain `node:http`).
- Routes are registered in the `routes` dictionary keyed by `'METHOD /path'` (e.g. `routes['GET /api/health']`).
- Data persistence uses `atomicWrite` (write-temp-then-rename) into `DATA_DIR`.
- Authentication: WebAuthn passkeys (`@simplewebauthn/server`) + signed HMAC session cookie.

### 3. The Hype Coach (`api/coach/`)
- Handles AI coaching prompts, routines, and motivational interactions.
- Personas: The Hype Man / Hype Woman — energetic, motivating, validating, and focused on discipline, PRs, and positive reinforcement without being annoying.
- Prompt templates live in `api/coach/prompts/`.

### 4. Code Style & Dependencies
- **Dependency-Light**: Do not introduce third-party libraries without explicit justification.
- **Plain JavaScript**: The repo intentionally uses plain modern JS with no TypeScript or ESLint. Match the existing style and clean code conventions.
- **Testing**: Test training logic with Vitest (`cd frontend && npm test`).

---

## Available Agent Skills

This repository includes specialized skills in `.agents/skills/`:
- `react-state-management`: Zustand store patterns, immutability, synchronization.
- `nodejs-backend-patterns`: Plain Node.js HTTP server routing, streams, and async patterns.
- `llm-application-dev-ai-assistant`: Designing the Hype Man/Woman conversational flows and coaching prompts.
- `prompt-engineering-patterns`: Structuring motivation, workout analysis, and PR celebration prompts.
- `unit-testing-test-generate`: Generating Vitest tests for `src/lib/*.js` helpers.
- `mobile-developer`: Capacitor native shell optimization and mobile persistence.
- `full-stack-orchestration-full-stack-feature`: Coordinating features touching both frontend and backend.
- `code-review-excellence`: Verifying changes against privacy, passkey, and performance constraints.
