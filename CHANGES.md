# Implemented changes

## Authentication deployment hardening

- Reduced PBKDF2 iterations for new accounts from 600,000 to 100,000 for Cloudflare Workers CPU compatibility. The per-account iteration value remains stored so existing hashes can still be verified.
- Account creation now writes the user, profile, credentials, starter tasks and first session in one transactional D1 batch.
- Added `/api/health` to distinguish a missing `DB` binding from an unavailable or incomplete schema.
- Authentication failures now return a safe error code plus a Cloudflare request ID instead of an unhelpful generic response.
- A partially created account from an older deployment can be recovered by signing up again with the same username and password.

## Operational agent and PhD OS foundation

- Replaced the read-only chat experience with typed create/update/delete task proposals.
- Added explicit preview, approve, reject, audit events and conflict-aware undo.
- Agent conversation history and proposals are isolated per authenticated user.
- Added the `/phd` command center, explainable match score, application shortlist, timeline and idempotent planner bridge.
- Added manual position intake with a Jalali deadline field and immediate scoring.
- Added a working notification center for overdue and seven-day tasks.

## Cloudflare

- Added production `wrangler.jsonc` with D1, Assets, Images, and environment bindings.
- Replaced OpenAI-hosting-specific Vite configuration with the Cloudflare Vite plugin configuration.
- Added Windows-safe npm scripts for development, migrations, type checking, building, and deployment.
- Deployment uses the generated `dist/server/wrangler.json` so compiled client assets are included correctly.

## Authentication and isolation

- Added `users` and `sessions` D1 tables and migration `0001_multi_user_auth.sql`.
- Added signup, username/password login, session lookup, and logout APIs.
- Passwords use salted PBKDF2-SHA-256 hashes with 600,000 iterations and automatic hash upgrades.
- Added authentication rate limiting, same-origin mutation checks and reduced session write amplification.
- Session cookies are secure in production and compatible with local HTTP development.
- Every task, profile, OpenRouter key, and Telegram integration remains scoped to the authenticated user ID.

## Tasks and dates

- Fixed new task submission to use `POST /api/tasks` instead of `PATCH /api/tasks/undefined`.
- Added backend rejection for missing or invalid task IDs.
- Added Jalali input, Jalali date picker, Jalali calendar navigation, and Jalali month range calculations.
- Gregorian ISO dates remain the database and API storage format.
- Rebuilt the task table layout with a dedicated checkbox column and a larger task-title column.

## Integrations

- OpenRouter credentials are stored per user with AES-GCM encryption.
- OpenRouter saving rejects confirmed 401 invalid keys but can save a key with a warning when verification is blocked or temporarily unavailable.
- Default model changed to `openrouter/free` for better availability.
- Telegram credentials and webhooks remain per user.

## Validation completed

- TypeScript passed.
- ESLint passed.
- Vinext production build passed.
- Rendered HTML test passed.
- Local D1 migrations passed.
- Signup, session login, per-user task isolation, task creation, task editing, invalid task-ID rejection, and logout were tested locally.
- Wrangler deployment dry run passed using the generated Worker configuration.
