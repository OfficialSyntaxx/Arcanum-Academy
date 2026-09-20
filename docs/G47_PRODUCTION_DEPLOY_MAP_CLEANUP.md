# G47 — production deploy-map cleanup

## Scope

Remove unused public source-map files from production client deployments while keeping local
developer diagnostics and the existing runtime support-report path.

## Build acceptance

1. Run the production client build.
2. Confirm `packages/client/dist` contains no `.map` files.
3. Confirm the hashed JavaScript, CSS, model, Draco, manifest, and service-worker files remain.
4. Run the complete typecheck, test, asset-budget, and production-build gates.

## iPhone acceptance

1. Clear site data, load the production PWA, and confirm boot completes normally.
2. Install the PWA and confirm the service worker reaches its ready state.
3. Submit an in-game support report and confirm the existing structured diagnostic flow is intact.
4. Confirm browser Console errors still include their production stack rather than failing to log.

## Boundaries

This changes production build artifacts only. It does not change client runtime logic, diagnostic
events, support-report payloads, gameplay, persistence, progression, networking, server runtime,
social features, model assets, or hosting configuration.
