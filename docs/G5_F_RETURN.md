# G5-F return — The Tideglass Trail

**Date:** 2026-09-15  
**Scope:** First persisted treasure-clue trail, ordered world investigations, mobile guidance, and a
one-time casket reward.

## Delivered

- **The Tideglass Trail**, unlocked by completing Beneath the Saltline.
- Four ordered investigation sites: Warden's Bearings, Library Plinth, Resonance Mark, and the
  Tidepool Cache.
- Server validation for prerequisite, expected step, authoritative zone, current position, and
  interaction range.
- Persisted schema-9 progress with reconnect-safe step, timestamps, completion, and reward receipt.
- One-time 45-coin casket settlement, capped safely at the global currency limit.
- Distinct procedural gold clue markers and a compact combat-safe mobile clue card.

## Automated acceptance

- Locked, wrong-order, wrong-zone/range, full ordered completion, duplicate claim, and currency-cap
  paths are covered.
- The clue catalog proves four unique sites in authored launch zones.
- World graph and interactable geometry validation cover every new marker and approach.
- Sync and command patches carry only server-confirmed clue progress.

## Verification result

- `npm run verify`: passed — 436 tests across 49 files, formatting, lint, boundaries, and types.
- `npm run build`: passed — client and server production builds.
- PWA precache: 25 files / 3,036.65 KiB; asset budget reports 3,068.8 KiB total.
- Largest precached asset: 551.9 KiB, inside the per-asset mobile limit.

## Manual acceptance

Run the G5-F section of `docs/IPHONE_ACCEPTANCE_CHECKLIST.md` on the installed iPhone PWA. Confirm
the marker visibility and clue-card placement in portrait and short landscape before closing visual
acceptance.
