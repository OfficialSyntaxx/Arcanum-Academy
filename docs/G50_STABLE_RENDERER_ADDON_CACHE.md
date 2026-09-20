# G50 — stable renderer add-on cache

## Scope

Give Three.js loader add-ons an independent hashed cache lifetime instead of embedding them in the
application-owned renderer bootstrap.

## Build acceptance

1. Build the production client and confirm separate `three` and `three-addons` chunks are emitted.
2. Confirm the renderer bootstrap is approximately 118 KiB rather than the G49 171 KiB result.
3. Confirm total production delivery remains materially unchanged.
4. Confirm the entry still loads the renderer graph only through the G48 asynchronous boundary.
5. Run the complete architecture, typecheck, test, asset-budget, and production-build gates.

## iPhone acceptance

1. Clear site data and confirm the boot screen and world load normally.
2. Confirm player, NPC, scenery, Shore Wolf, and deferred encounter models still decode.
3. Install one build, update to a UI-only build, and confirm the unchanged add-on chunk is reused.
4. Move rapidly between regions and confirm the shared one-worker decoder behavior from G45 remains.

## Boundaries

This changes production chunk ownership only. It does not change renderer or decoder behavior,
models, quality settings, gameplay, persistence, progression, networking, server runtime, social
features, assets, or hosting.
