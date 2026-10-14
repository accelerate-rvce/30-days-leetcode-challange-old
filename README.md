# Accelerate — 30 Days of LeetCode

A production-oriented full-stack platform for **Accelerate, the Computer Science Club of RVCE**, running a 30-day LeetCode challenge for RVCE students.

- **Frontend:** React 18 + TypeScript (strict) + Vite + Tailwind + Radix UI + Lucide + Motion + React Router (hash routing for static hosts) + TanStack Query + React Hook Form + Zod. Static build → GitHub Pages or Cloudflare Pages.
- **Backend:** Node 22 + Express + Zod validation + Prisma schema/migrations (PostgreSQL) + bcryptjs password hashing + opaque server-managed sessions. Runs on Render free web service.
- **Shared:** `@accelerate/shared` — validation schemas, email/slug helpers, API contracts. No server-only code leaks into the frontend.

## Architecture decisions

1. **HashRouter, not BrowserRouter.** GitHub Pages has no SPA fallback configuration; Cloudflare Pages needs a `_routes`/`_redirects` file. Hash routing works identically on both with zero host config. Trade-off: slightly uglier URLs (`/#/dashboard`).
2. **Storage abstraction.** The production path is Prisma → managed PostgreSQL (`STORE=prisma`, migrations in `apps/api/prisma/migrations`). The runtime defaults to `STORE=memory` so local dev, CI, and the automated test suite run with zero infrastructure. The memory store implements the exact same entity model/uniqueness constraints as the Prisma schema; swapping is one env var. This is documented, not hidden: `/ready` reports the active backend.
3. **Verification is a replaceable provider behind an interface** (`VerificationProvider`), strictly separated from the scoring engine. The default `mock` provider is explicitly flagged `mock:true` and **refuses to run in production** (falls back to manual-review mode). A generic `http` provider slot exists for an operator-configured lookup service; `disabled` forces manual review. No LeetCode credentials are ever collected; no scraping is attempted by default.
4. **Jobs are external + idempotent.** Render free services sleep; nothing essential lives in process memory or on the ephemeral filesystem. `POST /api/v1/jobs/run` (protected by `x-job-secret`) performs publish/archive reconciliation and is safe to call repeatedly; the server also reconciles on startup.
5. **Scoring is server-side only.** Points, ranks, statuses, and timestamps are computed by the backend from the ledger + verified completions. The client never submits scores.

## Monorepo layout

```
apps/web/        frontend (static build in dist/)
apps/api/        backend (Express; dist/ via tsc; prisma/ schema + migrations)
packages/shared/ zod schemas, helpers, contracts
render.yaml      Render free web service definition
```

## Local setup

Prerequisites: Node ≥ 20.

```bash
npm ci
cp .env.example apps/api/.env   # edit values; never commit secrets (.env is gitignored; real env vars always win)
npm run dev:api                  # :4000 (STORE=memory by default)
npm run dev:web                  # :5173 (VITE_API_BASE_URL → :4000/api/v1)
```

Seed demo data (clearly-marked DEMO, dev only): run the server with seeding enabled —
`SEED_DEMO=1 npm run dev:api` (demo admin: admin@rvce.edu.in / Password123!).
With `STORE=memory` every process owns an isolated store, so `npm run db:seed -w apps/api`
alone can never put users into the running server — the seed must happen at server boot.

## Scripts

| Command | What |
|---|---|
| `npm run typecheck` | strict tsc across all workspaces |
| `npm run test` | Vitest: shared (2) + API (25) + web (1) |
| `npm run build` | shared → api → web production builds |
| `npm run db:migrate -w apps/api` | `prisma migrate deploy` (needs DATABASE_URL) |
| `npm run dev:seeded -w apps/api` | dev server with `SEED_DEMO=1` (demo admin + challenges, dev only) |
| `npm run db:seed -w apps/api` | seed smoke check (exits; with `STORE=memory` use `dev:seeded` to log in) |
| `npm run bootstrap -w apps/api` | credential check / create SUPERADMIN from `BOOTSTRAP_ADMIN_EMAIL/PASSWORD` env only (with `STORE=memory`, start the server with the same env so it bootstraps at boot) |

E2E: `cd apps/web && npx playwright test` (needs API on :4000 + web on :5173; Chromium via `npx playwright install chromium`).

## Deployment

### Frontend — Cloudflare Pages (recommended)
1. Build command: `npm ci && npm run build -w packages/shared && npm run build -w apps/web`; output: `apps/web/dist`.
2. Env: `VITE_API_BASE_URL=https://<your-api>.onrender.com/api/v1`, `VITE_BASE_PATH=/`.
3. No redirects file needed (hash routing).

### Frontend — GitHub Pages
1. Same build with `VITE_BASE_PATH=/<repo-name>/`.
2. Deploy `apps/web/dist` via any static action (e.g. `peaceiris/actions-gh-deploy`). No Jekyll/SPA config needed thanks to hash routing.

### Backend — Render free web service
1. New Web Service from this repo; `render.yaml` provides build/start/health-check defaults.
2. Set env: `DATABASE_URL`, `SESSION_SECRET` (≥32 random chars), `WEB_ORIGIN` (exact Pages URL), `JOB_SECRET`, `EMAIL_PROVIDER=smtp` + SMTP vars, `VERIFICATION_PROVIDER=disabled` (until a lookup service is configured and reviewed).
3. Deploys run `prisma migrate deploy` on start. Handle cold starts: first request may take ~30–60s; the frontend shows loading states, and `/health` + `/ready` distinguish liveness from readiness.
4. External scheduler (Render Cron, GitHub Actions schedule, or cron-job.org — all free): `POST https://<api>/api/v1/jobs/run` with header `x-job-secret: <JOB_SECRET>` every 5–15 min.

### Database — managed PostgreSQL
Use Neon, Supabase, or Render Postgres free tier. Then: set `DATABASE_URL`, `STORE=prisma`, run `prisma migrate deploy`. **Check current free-tier policies before launch**: row/storage caps, inactivity suspension/deletion, and backup/export availability vary and change often. Export via `pg_dump $DATABASE_URL` weekly; CSV exports for leaderboard/completions/participants are also in the admin panel.

### First admin (secure bootstrap)
With the default `STORE=memory`, each process owns an isolated store — so start the
server itself with the bootstrap credentials (it bootstraps at boot, idempotently):
```bash
BOOTSTRAP_ADMIN_EMAIL=you@rvce.edu.in BOOTSTRAP_ADMIN_PASSWORD='<strong, unique>' npm run dev:api
```
Then log in with those credentials; the account has role `SUPERADMIN` and can open `/#/admin`.
`npm run bootstrap -w apps/api` with the same env vars works as a credential check, but its
created user vanishes when that process exits under `STORE=memory`.
Passwords are bcrypt-hashed; never hardcoded. Rotate the password after first login via forgot-password.

## Registration modes & scoring

- Modes: `WAITLIST` (default; join → verify email → admin approve/invite → register) · `OPEN` (direct registration) · `CLOSED`.
- Scoring defaults: active-window verified solve **100**, archived **25**, unverified/duplicate **0**. One completion per user+challenge (DB unique constraint). Every award writes to the score ledger; manual adjustments need a reason + write an audit entry.
- Tie-breaks: totalPoints → verifiedCount → longestStreak → earliest lastVerifiedAt → displayName.

## Verification

See `docs/` (API doc below) and `GET /api/v1/verification` for live provider status. Mock rule (dev/test only): handles starting with `solved-` verify. Production default is manual review until operators configure + legally review an automated lookup. Retries use backoff; inconclusive results never award points.

## API

Versioned under `/api/v1`; machine-readable contract at `GET /api/v1/openapi.json`. Summary:

- `auth`: register · verify-email · login · logout · me · forgot/reset-password · sessions/revoke-all
- `waitlist`: join · verify · status (admin: list/approve/reject/invite under `/admin/waitlist`)
- `challenges`: list · today (server-time) · day/:n (admin CRUD/publish/archive/import/history under `/admin/challenges`)
- `completions`: claims · claims/:id/retry · mine
- `leaderboard`: paginated public board · me · users/:username
- `admin`: overview · users (suspend/reactivate/role/reset/revoke/export.csv) · verifications + review · ledger/adjust/audit · leaderboard/export.csv · settings
- `super`: grant-admin (SUPERADMIN only)
- `event`/`profile`/`verification` public; `jobs/run` (secret) + `jobs` (admin); `/health`, `/ready`

Errors: `{ error: { code, message, details? } }`. Pagination: `{ data, page, pageSize, total, totalPages }`. CORS: explicit `WEB_ORIGIN` list, credentials on; cookies `HttpOnly`, `Secure` in production, `SameSite=lax`, plus origin check on cookie mutations.

## Security & privacy notes

- bcrypt (cost 12) password hashing; opaque session tokens stored as SHA-256 hashes; single-use expiring hashed email tokens (verify 24h, waitlist 48h, reset 1h, invite 7d); sessions revocable individually or globally; password reset revokes all sessions.
- Rate limits on auth/waitlist/claims; anti-enumeration (generic login failures, generic forgot-password 200, generic waitlist join success); admins can never read passwords — only trigger resets, revoke sessions, suspend.
- Minimal data: name, RVCE email, LeetCode handle, consent flag. No trackers. Email sending is honest: `emailSent:false` + error is returned when delivery is unconfigured/fails.
- Never commit secrets; `.env.example` contains placeholders only.

## Test results (this build)

- `packages/shared`: 2/2 pass · `apps/api`: 25/25 pass (auth modes, verification expiry, login/logout/reset, RBAC incl. super-only grant, scheduling conflicts + idempotent publish/archive, active/archived scoring, duplicates, ledger, tie-breaks, manual review, CSV auth, audit) · `apps/web`: 1/1 pass.
- `npm run typecheck`: clean across workspaces. `npm run build`: api + web succeed.
- Playwright: 4 essential flows listed (`npx playwright test --list` clean; full browser run needs the local stack + `npx playwright install chromium`).

## Required external credentials & free-tier limits

- Managed PostgreSQL URL (Neon/Supabase/Render — verify quotas, sleep/deletion policies, backups).
- SMTP credentials for real email (or `EMAIL_PROVIDER=log` for dev; the UI tells users honestly when mail isn't configured).
- Optional: LeetCode lookup service URL for automated verification (else manual review, which is fully supported).
- Render free: cold starts, sleep, ephemeral filesystem (nothing persistent stored locally — by design), 750h/month.
- GitHub/Cloudflare Pages: static only (fine — frontend is fully static).

## Known limitations

1. `STORE=memory` does not persist across restarts — production must use `STORE=prisma` + managed Postgres.
2. Automated LeetCode verification ships as mock + disabled-by-default; production relies on manual review until a compliant lookup is configured.
3. Leaderboard rank movement shows only live ranks (no fabricated history); snapshots are a future enhancement.
4. Sessions are opaque tokens in HttpOnly cookies (+ Bearer fallback for API clients); true multi-device management UI is minimal (revoke-all).
