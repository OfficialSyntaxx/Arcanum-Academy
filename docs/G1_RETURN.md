# G1 — Shorelands environment pass

Status: **PROVISIONAL, not a completed game or passed G1 gate.**

Base: `1be587ca441563f74ad1a965f7f1a06b047e65c6`, the G0 branch
`claude/mobile-game-tech-evaluation-n9c7u8`, not the old academy on `main`.

## Implemented

- Local KayKit tree, rock and cottage GLBs, imported from donor commit
  `3edfde7af1f0a5bf6e378fc0ec2fff22d16258ae`; provenance in `CREDITS.md`.
- One instance batch per source mesh, shared materials, device-tier foliage density,
  complete immediate procedural fallbacks and late-load disposal protection.
- Warm grass, honey stone, turquoise coast, warm daylight, low lantern ruins,
  cottage pockets and wildflowers. Scenery follows the existing courtyard graph.
- Oakenfall-inspired timber/amber HUD; clearer two-line location strip, safe-area-aware
  panels and a separate connection strip. Existing tap/drag/pinch controls remain.
- A phone-friendly local map lists resources and crafting stations and walks the player
  to the selected landmark through the authored waypoint graph.
- The satchel now shows all gathering and crafting skill levels, XP totals and progress
  to the next level alongside the 28-slot inventory.
- Ground picking excludes decorative props and supports elevated authored terrain.
- Sunken terraces are no longer covered by the zone's base floor. The base ground mesh
  is cut around every raised or lowered authored terrace and remains one draw call.
- PWA copy no longer describes a card academy; removed external font requests;
  locally cached GLBs/Draco; added Apple touch-icon link.
- `npm run smoke`: production client plus real in-memory gateway, pinned wall time,
  phone/landscape/desktop screenshots, canvas colour variety, HUD bounds, inventory,
  errors and a mutation that suppresses draw calls while retaining the HUD.
- CI runs the smoke suite and uploads its screenshot evidence. No simulation or server
  implementation was changed. No bank, combat or quest system was added.

## Verification

- Baseline `npm run verify`: 362/362 tests, all checks passed.
- Post-change `npm run verify`: 363/363 tests, all checks passed, including a raycast
  regression test for the sunken mine floor.
- Production build: passed.
- All imported model textures: 512 × 512. Individual GLBs: 23–30 KB.
- Runtime payload before source maps: approximately 1.25 MB raw / 411 KB individually
  gzipped. This is an artifact measurement, not an observed network download.
- Interactive cloud-browser verification: **blocked**. Chrome reports WebGL disabled
  (`GL_RENDERER = Disabled`), and the renderer cannot obtain a context. This is not
  evidence that the scene looks correct or performs well.
- The branch is published as `codex/g1-shorelands` with draft PR #1. CI validates all
  code gates and a full phone journey through the real gateway: map, walk, mine, earn XP,
  inspect the satchel, then reach a crafting station. It also verifies that Three.js submits
  the zone's draw calls and triangles in phone, landscape and desktop layouts.
- GitHub's Linux Chrome compositor still captures an all-black WebGL screenshot despite
  accepting the context and processing draw calls. CI screenshots are therefore diagnostic
  only, not art approval. This runner limitation is separate from the gameplay journey,
  which passes.
- The production Render gateway answered `/healthz`, reported protocol version 1, and
  completed an authenticated-origin WebSocket handshake with a `player.sync` response.
- Actual iPhone, home-screen PWA, genuine pinch and sustained 30fps: **NOT RUN**.

## Remaining G1 work / decisions

1. Get a green follow-up CI run, then use a real iPhone/home-screen session to judge the
   rendered scene; the Linux compositor cannot be used for that visual decision.
2. Tune framing/pitch against the rendered zone with the owner; current camera tunables
   are preserved, as the handover reserves feel changes for the owner.
3. Have the owner judge a real iPhone home-screen screenshot and measure performance.
4. This is a scenery pass over the existing courtyard navigation, not the final authored
   Shorelands topology. Legacy resource/NPC content still exists and later gates remain.
5. A playable hosted economy needs the existing WebSocket gateway and durable database
   configured. A static-only deployment must not be represented as a complete RPG.

No merge into `main` or replacement of an existing deployment is part of this change.
