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

## G6-C — isolated operations console

- [ ] Build the game and operations console independently; confirm `npm run admin-isolation` passes
      after the production game build.
- [ ] Search the player PWA source and output for `@alderfell/admin`, `Alderfell Operations`,
      `/admin/players`, and `ADMIN_READ_TOKEN`; confirm every marker is absent.
- [ ] Host only `packages/admin/dist` on a private HTTPS origin; do not link it from the game.
- [ ] Set that exact origin in `ADMIN_ALLOWED_ORIGINS`; confirm an unlisted Origin receives concealed
      404 and the listed origin receives a successful OPTIONS preflight.
- [ ] Reload and reopen the console; confirm endpoint and token must be entered again.
- [ ] Connect, then inspect browser local storage, session storage, cookies, URL, page source, and
      network request URL; confirm the token appears only in the request Authorization header.
- [ ] Disconnect; confirm subsequent searches require the token again.
- [ ] At 320px portrait width, test connect, search, save detail, snapshot detail, audit, back, and
      disconnect without horizontal page overflow or controls smaller than 44px.
- [ ] Inspect fields containing HTML-like player text; confirm it renders as text, never markup.
- [ ] Attempt POST/PUT/PATCH/DELETE against every visible resource; confirm 404 and no save change.
- [ ] Confirm snapshot and restore-audit views remain readable for empty and populated histories.

## G6-D — overview, diagnostics, and reports

- [ ] On a 320px-wide phone, confirm long player IDs wrap inside the account card and never create
      horizontal page scrolling.
- [ ] Confirm Overview totals match the authoritative database and runtime `/metrics` values.
- [ ] Confirm the Players, Reports, and Events navigation remains reachable with one tap.
- [ ] Confirm raw save JSON starts collapsed and summary cards show coins, bag, bank, skills, quests,
      and zone without changing the save.
- [ ] Submit each report category from the game and confirm its receipt appears in Operations.
- [ ] Confirm a report carries no identity token, IP address, cookie, or more than ten diagnostic
      events in either the request body or admin response.
- [ ] Confirm a foreign Origin is refused, malformed text is refused, and attempt six in one hour is
      rate-limited without creating a report.
- [ ] Confirm Events omits source IP addresses and shows newest retained events first.
- [ ] Restart staging and confirm reports persist through the Postgres adapter.
- [ ] Confirm no POST/PUT/PATCH/DELETE account route or account-editing control has appeared.

## G6-D.1 — administrator login

- [ ] Enable Netlify Identity with registration set to **Invite only** and invite only the owner.
- [ ] Set `ADMIN_AUTHORIZED_EMAIL` to the exact invited account; confirm any other valid Identity
      account receives 403 and no operations payload.
- [ ] Rotate the previously shared read token and set the replacement only as Render
      `ADMIN_READ_TOKEN` and Netlify `ALDERFELL_ADMIN_READ_TOKEN` (never a `VITE_*` variable).
- [ ] Confirm the login page contains Username and Password only—no Render endpoint or token field.
- [ ] Accept a fresh invitation, set a 12+ character password, sign in, reload, and sign out.
- [ ] Confirm wrong credentials return generic copy and neither disclose account existence nor log a
      password.
- [ ] Complete password recovery and verify the old password can no longer create a session.
- [ ] Confirm the proxy permits only the authored GET routes; mutations return 405 and unknown paths
      return 404.
- [ ] Inspect HTML, JavaScript, storage, URLs, and request URLs for the Render token; it must never
      appear. The `nf_jwt` session cookie must be Secure and HttpOnly where emitted by Netlify.
- [ ] After login, repeat the complete G6-D mobile navigation and read-only data checks.

## G6-E — audited snapshot restore

- [ ] Review the exact snapshot before the restore action becomes available.
- [ ] Confirm a 10+ character reason and fresh password confirmation are required.
- [ ] Restore a staging account and confirm the receipt records actor, reason, snapshot, and versions.
- [ ] Confirm a new `PRE_RESTORE` snapshot contains the displaced live state and can undo the repair.
- [ ] Confirm a stale expected version, foreign snapshot, invalid reason, expired re-authentication,
      and a direct/non-allowlisted POST leave the live save untouched.
