# G5-E return — The Saltwake Ruins

**Date:** 2026-09-15  
**Scope:** First dungeon, boss, persistent first-clear reward, quest, diary, licensed creature art.

## Delivered

- Hand-authored three-room Saltwake Ruins zone and Library-shore descent.
- Server-confirmed, persisted travel and safe reconnect destination.
- Drowned Sentinel gallery gate and two-phase Drowned Warden boss.
- Quaternius Ghost and Ghost Skull GLBs, admitted under CC0 1.0 and palette-treated in client.
- One-time atomic Tideglass Reliquary, Tideglass Charm, and permanent shortcut receipt.
- Beneath the Saltline quest: Sentinel, Warden, charm, 100 coins once; charm is not consumed.
- Four server-confirmed dungeon discoveries and The Saltwake Remembers diary (15 coins once).
- Zone-aware permanent gravestones and mobile dungeon/boss guidance.

## Automated acceptance

- World graph and zone catalog validate the fifth authored zone.
- Locked/accepted travel, persisted entry, chest prerequisites, full-satchel atomicity, duplicate
  claims, shortcut persistence, boss ordering, phase transition, encounter discoveries, quest kill
  counts, permanent proof-item turn-in, and duplicate quest completion are covered.
- Client tests prove the scene switches only after the authoritative travel patch.
- Full verification, production build, and asset-budget results are recorded in the release commit.

## Verification result

- `npm run verify`: passed — 431 tests across 47 files, formatting, lint, boundaries, and types.
- `npm run build`: passed — client and server production builds.
- PWA precache: 25 files / 3,033.42 KiB; budget check reports 3,065.5 KiB total.
- Drowned Sentinel GLB: 203.36 KiB built; Drowned Warden GLB: 232.38 KiB built.
- Largest precached asset: 551.9 KiB, inside the per-asset mobile limit.

## Manual acceptance

Run the G5-E section of `docs/IPHONE_ACCEPTANCE_CHECKLIST.md` on the installed iPhone PWA. Browser
visual capture is not treated as complete until a real device run is reported.
