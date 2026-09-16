# G6-D return — operations overview and player reports

**Date:** 2026-09-16  
**Scope:** First-party operational visibility, durable player feedback, and mobile console usability.

## Delivered

- Operations overview with authoritative account totals, recent-save activity, connections, resumable
  sessions, uptime, process memory, snapshot/restore totals, diagnostic counts, and open reports.
- Dedicated console navigation for Overview, Players, Reports, and Events.
- Mobile account inspection with long identifiers wrapping safely, account summary cards, and raw
  redacted JSON collapsed behind an explicit disclosure.
- Restore-audit presentation now uses the receipt's actual `afterVersion` and `restoredAtMs` fields.
- Sanitized recent diagnostic feed: network source addresses never cross the admin API.
- In-game report sheet for Bug, Gameplay, Account, and Feedback reports.
- Player reports attach the confirmed player ID and at most ten recent bounded diagnostic events.
- Durable Postgres report storage with 90-day retention, a 100-report admin view, and an in-memory
  development adapter.
- Exact game-origin checks, schema validation, and a limit of five submission attempts per IP/hour.
- No third-party analytics, location trails, advertising identifiers, cookies, or account mutation
  controls.

## Verification

- Focused tests cover report schemas, retention order, origin refusal, invalid payloads, hourly rate
  limiting, client payload minimisation, aggregate account metrics, sanitized admin responses, and
  GET-only console methods.
- `npm run verify`: passed — 467 tests across 55 files, formatting, lint, architecture, types, and
  admin isolation.
- `npm run build`: passed — player PWA, admin console, server bundle, and mobile asset budget.
- Player PWA: 25 precached files / 3,071.8 KiB. Admin console: 11.08 KiB JavaScript and 4.97 KiB CSS
  before gzip.
- Package builds clear their exact generated output after TypeScript validation, preventing stale
  emitted modules and obsolete hashed chunks from entering a deploy or distorting the mobile budget.

## Deployment

The existing Render deploy creates `support_reports` idempotently at startup. The existing Netlify
admin site and player site deploy automatically from `main`; no new secret or paid service is needed.
`ALLOWED_ORIGINS` must continue to contain the exact player-site origin so report submissions pass
the same first-party origin policy as diagnostics.
