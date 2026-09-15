# G6-A return — save snapshots and safe restoration

**Date:** 2026-09-15  
**Scope:** Internal persistence safety layer. No public or admin mutation route is exposed yet.

## Delivered

- Every successful player save captures the exact previous record before the live version changes.
- Snapshot history is isolated per account and bounded to the newest 20 versions.
- Both in-memory development storage and production Postgres implement the same repository contract.
- Restoration requires player, snapshot, expected live version, named operator, and written reason.
- Every restore first captures the displaced live record as `PRE_RESTORE`, advances the live version,
  and appends an immutable before/after audit receipt.
- Missing snapshots, stale expected versions, and missing audit context are refused without changing
  player state.

## Verification

- `npm run verify`: passed — 444 tests across 50 files, formatting, lint, boundaries, and types.
- `npm run build`: passed — client and server production builds.
- Client PWA remains unchanged at 25 precached files / 3,068.8 KiB total asset budget.
- Focused tests cover capture, stale writes, retention, restoration, pre-restore backup, audit receipts,
  and refusal atomicity.

## Deliberate boundary

G6-A exposes no HTTP admin route and accepts no browser credential. G6-B can now build authenticated,
read-only account inspection over this foundation; mutation routes remain blocked until separate admin
authentication, request rate limits, and audit presentation exist.
