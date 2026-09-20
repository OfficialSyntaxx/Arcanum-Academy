# G49 — on-demand reference panels

## Scope

Keep reference panels out of initial parsing while leaving moment-to-moment world controls eager.

## Build acceptance

1. Build the production client and confirm map, journal, collection, and profile chunks are emitted.
2. Confirm the initial entry is smaller than the G48-only 186 KiB result.
3. Confirm HUD, economy, combat, movement, and minimap code remains in the eager application graph.
4. Run the complete architecture, typecheck, test, asset-budget, and production-build gates.

## iPhone acceptance

1. Load the Shorelands and confirm no panel chunk is required before the world becomes interactive.
2. Open Map, Journal, Collection, and Profile once each; confirm the compact `Opening panel…` status
   appears only when a chunk is not already ready.
3. Reopen each panel and confirm it appears without a second fetch.
4. Open a public-profile link directly and confirm its comparison loads after the fallback.
5. Begin movement with a contextual panel open and confirm the established dismissal rules remain.

## Boundaries

This changes client module-loading timing only. It does not change panel data, map navigation,
profile privacy, gameplay, persistence, progression, networking, server runtime, social writes,
assets, or hosting.
