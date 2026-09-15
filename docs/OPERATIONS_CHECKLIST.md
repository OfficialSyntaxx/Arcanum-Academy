# Alderfell operations acceptance checklist

Use this checklist for every G6 operations phase. Record command output or a test name for automated
checks; never use a production player as an experiment.

## G6-A — snapshots and restoration

- [ ] A successful save creates one snapshot containing the exact prior schema, version, and data.
- [ ] A version-conflicted save creates no snapshot and changes no live data.
- [ ] Snapshot retention never exceeds 20 entries for one account and never prunes another account.
- [ ] Snapshot records cannot be updated through the repository interface.
- [ ] Restore refuses a snapshot belonging to another player.
- [ ] Restore refuses stale expected live versions.
- [ ] Restore refuses blank operator identity or reason.
- [ ] Restore creates a `PRE_RESTORE` snapshot before changing the live save.
- [ ] Restore advances the current version; it never rewinds optimistic-concurrency history.
- [ ] Restore writes an append-only receipt with actor, reason, target, source snapshot, before version,
      after version, and timestamp.
- [ ] Any restore failure leaves the live record, snapshots, and audit log unchanged.
- [ ] In production staging, confirm both Postgres tables and owner indexes are created idempotently.

## Before exposing any G6-B admin route

- [ ] Separate admin authentication is configured; player credentials cannot authorize it.
- [ ] Authentication comparison is timing-safe and secrets never enter logs or client bundles.
- [ ] Every route is rate-limited and access attempts are logged.
- [ ] Account inspection is read-only by default and redacts credentials/tokens.
- [ ] Mutation endpoints remain absent until their complete undo path is demonstrated.

## G6-B — read-only account inspection

- [ ] With `ADMIN_READ_TOKEN` unset, every `/admin/*` request returns 404.
- [ ] Missing, malformed, short, and wrong bearer credentials receive the concealed 404 response.
- [ ] Generate the production token from a secure random source with at least 32 characters; keep it
      only in the server environment and never in a `VITE_*` value.
- [ ] Search player IDs with ordinary text plus `%` and `_`; confirm wildcard characters are treated
      literally and pages never exceed 100 records.
- [ ] Inspect a current save containing token-, secret-, password-, and credential-shaped nested keys;
      confirm every value is replaced by `[REDACTED]`.
- [ ] Confirm snapshot lists contain metadata only and snapshot detail requires a separate request.
- [ ] Confirm restore-audit history is readable and ordered, while POST/PUT/PATCH/DELETE mutation
      attempts remain 404.
- [ ] Make 31 requests inside one minute from one test address; confirm request 31 is rate-limited.
- [ ] Review structured logs: accepted/refused/rate-limited attempts include IP, method, and route
      pattern, but never the token or raw query text.
