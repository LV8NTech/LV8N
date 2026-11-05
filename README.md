# HireSense — event submission

**Event repository:** https://github.com/LV8NTech/LV8N

HireSense compares not hiring, planned hiring, reduced hours and delayed hiring with an authoritative calculator. Meta Muse Spark 1.3 explains those calculated scenarios through AI Scenario Review and typed Ask HireSense. It does not make hiring decisions.

## What is event work and what predates it
The standalone interface, shared temporary inputs, custom-input Meta integration, Q&A, consent, snapshot invalidation, response formatting, exact-origin protection and durable operational accounting form this prototype.
The Elevation/LV8N calculator, financial formulas, two fictional profiles, original calculator tests and error helper predate the event. They are **not included in this repository or its Git history**. They are maintained separately at https://github.com/LV8NTech/elevation-hiring-calculator and pinned to commit `7c6166efe713a432131d6ce49e0075325289a725`. React/Vite/Express, generated API tooling and UI primitives are third-party/scaffold work, not claimed as original invention. Owner authorization is recorded in the dependency repository. Preserve package license notices. The submitter must confirm event rules permit these declared pre-existing components; this README is not an eligibility certification.

## Reproduce (verified on Linux, Node 24 and pnpm 10)
1. Clone this repository.
2. `pnpm install --frozen-lockfile` fetches the separate calculator at its immutable commit and verifies lockfile integrity. No sibling folder or original LV8N source tree is needed.
3. Configure server-only `DATABASE_URL` and `Meta_model_api_key` using your host's secret manager. Never commit actual values or use a frontend/VITE key.
4. Apply schema to your development PostgreSQL: `pnpm --filter @workspace/db run push`. For Replit production, Publish applies the schema; no startup DDL is used.
5. `pnpm run typecheck:libs`
6. Start the API: `PORT=8080 pnpm --filter @workspace/api-server dev`
7. Start the frontend: `PORT=26050 BASE_PATH=/ pnpm --filter @workspace/hiresense dev`

Local calculations require neither login nor AI. Meta access deliberately fails closed on unconfigured origins. The supplied development policy trusts the original project's verified Replit Preview only; a fork must explicitly configure its own trusted Preview metadata. For a production-like local integration test, use your own exact HTTPS origin and the production settings below, not a wildcard.

## Production setup
Build: `pnpm --filter @workspace/api-server build` and `PORT=26050 BASE_PATH=/ pnpm --filter @workspace/hiresense build`.
Serve `artifacts/hiresense/dist/public` with SPA fallback. Route `/api` to the API service on the **same HTTPS origin**.
Run API: `NODE_ENV=production PORT=8080 node artifacts/api-server/dist/index.mjs`.
Set `HIRESENSE_META_ENABLED=true`, `HIRESENSE_META_PUBLIC_ENABLED=true`, and `HIRESENSE_META_PUBLIC_ORIGIN` to the exact published HTTPS origin, no trailing slash.
No demo password or sign-in is required. Unrelated origins are rejected. The selected original-project address is https://hire-sense-platform.replit.app; publication and production verification remain owner steps. If a different address is chosen, update the exact origin before allowing AI.

PostgreSQL stores only operational usage and rate-window metadata. Carry existing counts forward on the first publication; never overwrite an existing production counter. The supplied schema's historical baseline is 10 attempts from this project, not provider credits. An independent deployment using its own account may explicitly choose its own initial baseline before first use.

## Data and provider boundaries
Inputs and conversation history stay in tab memory and clear on refresh. Explicit consent and Send/Generate are required. Server-validated inputs and calculator results, plus bounded question/history for Q&A, are sent to Meta. Business names are omitted; do not enter confidential identifying details in questions. Questions are not promised to be automatically sanitized. Provider storage is requested as `store:false`, without inventing additional retention guarantees.
There is no artificial five-request cap. Provider credits are not known to this app. Rate limits, response/request size limits, timeouts and no automatic paid retries remain. Financial inputs, transcripts and credentials are excluded from diagnostic logs.

## Verification
See RELEASE-CHECKS.md for actual checks, mock-versus-live distinctions and pending production verification. No paid provider test was made during release preparation. The source export contains no old workspace Git history, attachments, credentials, financial payloads or previous response logs.
