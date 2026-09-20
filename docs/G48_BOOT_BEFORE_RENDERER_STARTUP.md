# G48 — boot-before-renderer startup

## Scope

Remove the 3D renderer graph from the first React paint's static dependency path while preserving
the established ordered bootstrap and fault-tolerant startup.

## Build acceptance

1. Build the production client and confirm bootstrap is emitted as an asynchronous chunk.
2. Confirm the entry chunk no longer statically imports the Three.js vendor chunk.
3. Confirm the renderer chunk still imports the existing Three.js vendor chunk when requested.
4. Run the complete architecture, typecheck, test, asset-budget, and production-build gates.

## iPhone acceptance

1. Clear site data and load the production site on a throttled connection.
2. Confirm the boot panel paints before the 3D world becomes ready instead of showing a blank page.
3. Confirm every boot step still advances in order and the Shorelands opens normally.
4. Background or close the page during boot, return, and confirm no duplicate canvas, socket, or
   frame loop survives.
5. Force a bootstrap failure and confirm the existing fault screen still appears.

## Boundaries

This changes client module-loading order only. It does not change renderer settings, bootstrap
service order, gameplay, persistence, progression, networking, server runtime, social features,
assets, or hosting.
