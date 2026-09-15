# G6-C return — isolated operations console

**Date:** 2026-09-15  
**Scope:** Separate mobile-safe, read-only browser client for the G6-B inspection API.

## Delivered

- Independent `@alderfell/admin` Vite package with no game, React, Three.js, server, shared, or sim
  dependency.
- Operator-entered server endpoint and read token; the credential is held only in an in-memory API
  object and cleared from the form after connection.
- Player-ID search with bounded API pagination and useful save metadata.
- Redacted current-save JSON inspection.
- Snapshot metadata list and separately requested snapshot-state inspection.
- Immutable restore-audit history.
- 44px controls, responsive one-column phone layout, horizontal mobile tabs, safe text rendering, and
  reduced-motion support.
- Explicit disconnect plus tab-exit credential release. No local/session storage, cookie, URL token,
  build-time token, or mutation method exists.
- Admin-only CORS allowlist via `ADMIN_ALLOWED_ORIGINS`; wildcard browser origins are unsupported.
- Executable boundary and bundle-marker checks proving admin code is not admitted to the player PWA.

## Verification

- Focused admin client and server security tests cover endpoint validation, encoded IDs, bearer-header
  transport, concealed authentication failures, absent mutations, configured-origin preflight, and
  refused browser origins.
- `npm run verify`: passed — 456 tests across 52 files, formatting, lint, boundaries, types, and
  source isolation.
- `npm run build`: passed — game, operations console, emitted-bundle isolation, asset budget, and
  server bundle.
- Operations output is 6.98 KiB JavaScript and 2.79 KiB CSS before gzip. The unchanged player PWA
  remains 25 precached files / 3,068.8 KiB.

## Deployment

1. Build `@alderfell/admin` and publish only `packages/admin/dist` to a private/static HTTPS origin.
2. Put that exact origin in server `ADMIN_ALLOWED_ORIGINS` (comma-separated when needed).
3. Put a securely generated 32+ character value in server `ADMIN_READ_TOKEN`.
4. Restart the server, open the operations origin, and enter the server URL and token manually.

The console is intentionally not linked from Alderfell and is not a substitute for authentication
at the hosting layer. Leaving `ADMIN_READ_TOKEN` absent keeps every server admin route unregistered.
