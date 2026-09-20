# G46 — deferred later-encounter models

## Scope

Keep later-region creature models out of the first PWA installation while retaining local hashed
assets and reliable reuse after their first encounter.

## Build acceptance

1. Build the client and inspect the generated service-worker precache manifest.
2. Confirm Armabee, Drowned Sentinel, and Drowned Warden GLBs are absent from precache entries.
3. Confirm player/NPC outfits, animations, scenery, Draco, and Shore Wolf remain precached.
4. Confirm all three deferred GLBs remain in `dist/assets` and beneath the per-file asset ceiling.

## iPhone acceptance

1. Install or refresh the PWA on a cleared site-data profile and enter the Shorelands.
2. Confirm player, NPC, scenery, and Shore Wolf models load normally.
3. Reach each deferred creature while online and confirm its model replaces the procedural fallback.
4. Revisit each encountered creature after disabling the network and confirm its model is served from
   the bounded runtime cache.
5. Confirm a deferred-model fetch failure retains the existing playable procedural fallback.

## Boundaries

This changes service-worker delivery timing for three existing later-encounter GLBs only. It does
not alter their files, provenance, encounters, combat, progression, persistence, networking,
server runtime, social features, or hosting.
