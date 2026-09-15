# G6-B return — read-only account inspection

**Date:** 2026-09-15  
**Scope:** Separately authenticated and rate-limited operations API. No admin mutation route exists.

## Delivered

- `/admin` is absent unless `ADMIN_READ_TOKEN` is configured with at least 32 characters.
- SHA-256-normalized, timing-safe bearer-token comparison independent of input length.
- Paginated literal player-ID search with a maximum page size of 100.
- Redacted current-save inspection with useful operational summary fields.
- Snapshot metadata list, separately requested redacted snapshot detail, and restore-audit history.
- Recursive redaction for token, secret, password, and credential-shaped fields.
- Per-IP 30-request/minute limit with bounded limiter memory.
- Structured logs for accepted, refused, and rate-limited access without raw query strings.
- Explicit architecture rule for the admin layer: reads may inspect persistence; future writes must
  enter through domain services.

## Verification

- `npm run verify`: passed — 452 tests across 51 files, formatting, lint, boundaries, and types.
- `npm run build`: passed — client and server production builds.
- The player PWA is unchanged at 25 precached files / 3,068.8 KiB total asset budget.
- Tests cover valid/invalid/missing credentials, recursive redaction, search and inspection,
  snapshot metadata/detail separation, audit visibility, absent mutation routes, and throttling.

## Deployment

Generate `ADMIN_READ_TOKEN` from a cryptographically secure random source and store it only in the
server environment. Never place it in a `VITE_*` variable, browser storage, repository file, URL, or
support message. Restart the server after setting it; leaving it unset safely leaves `/admin` absent.
