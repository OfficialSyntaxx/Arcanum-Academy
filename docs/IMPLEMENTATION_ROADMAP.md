# Implementation Roadmap

Eight phases, in production order. Each phase lists what it builds, what it depends
on, and the exit criteria that must be green before the next phase starts. A phase is
not "done" because the code exists; it is done when its exit criteria pass in CI.

The estimates assume a small team working continuously. They are ranges, not
commitments.

---

## Phase 1 — Foundation ✅ complete

**Goal:** an engine that runs, boundaries that are enforced, and a safety net that
catches regressions.

**Built:** workspace and toolchain; `@arcanum/shared` (ids, results, failures, RNG,
event bus, logging, tunables, wire protocol, migrations); `@arcanum/sim` (fixed
clock, state hashing, phase machine, deterministic kernel); `@arcanum/server`
(config, gateway, sessions, persistence port, health endpoints); `@arcanum/client`
(container, frame loop, device tiering, renderer, input, transport, storage, UI
shell, PWA); boundary linter; CI.

**Exit criteria — all green:**

- [x] `npm run verify` passes: format, lint, boundaries, typecheck, tests
- [x] 117 tests across 16 files
- [x] Client builds and installs as a PWA
- [x] Boundary linter demonstrably fails on a real violation
- [x] Determinism: identical seed and command log produce an identical state hash
- [x] No gameplay implemented — deliberately

---

## Phase 2 — World, camera, input — **built, pending device measurement**

**Goal:** a hub you can move around on a phone, at 60 fps on a mid-range device.

**Depends on:** Phase 1.

**Built:**

- [x] Zone content model — waypoint graph, terraced terrain, interactables, NPC
      schedules — authored as data and validated at load. The Courtyard of the
      Arcanum (GDD §6) ships as the first zone.
- [x] Navigation: hand-authored waypoint graph rather than a navmesh, with
      deterministic A* over integer indices. The server validates movement
      against the identical graph.
- [x] Character controller: floating virtual joystick with dead-zone rescaling,
      and tap-to-move that paths through the graph then walks the final metre to
      the tapped point.
- [x] Camera rig: frame-rate-independent follow smoothing, drag orbit, pinch
      zoom, clamped pitch, and a `frame()` operation that composes a shot — the
      seam the Phase 5 duel transition uses to avoid a loading screen.
- [x] NPC framework: schedules evaluated as a pure function of the world clock,
      so no NPC position is ever replicated. Named cast plus a generated ambient
      crowd, all drawn from a two-draw-call instanced actor pool sized by the
      device's quality tier.
- [x] Accessibility floor: reduced motion, text scaling, high contrast and a
      colour-blind-safe flag, seeded from OS settings and projected onto the
      document root so no component threads a preference.

**Deferred within this phase:** asset loading with per-tier LODs and a residency
policy. The courtyard is procedural geometry with no external assets, so there is
nothing yet to stream; this lands with the Phase 3 content pipeline.

**Exit criteria:**

- [x] Movement and camera fully usable one-handed in portrait
- [x] Ambient crowd budgeted by quality tier, two draw calls regardless of size
- [ ] Sustained 60 fps and under 250 MB JS heap on a 2021 mid-range Android
- [ ] Under 120 draw calls in the hub at the Medium tier
- [ ] Time-to-interactive under 4 s on a simulated Fast 3G cold load
- [ ] Automated performance check in CI against a headless GPU baseline

**Open:** every remaining box needs a real device. They are measurements, not
code, and the phase is not closed until they are taken.

**Risks:** three.js bundle size against the time-to-interactive budget; iOS Safari
WebGL context limits when the app is backgrounded.

---

## Phase 3 — Inventory, gathering, crafting, skills

**Goal:** the first economic loop, resolved server-side.

**Depends on:** Phase 2 (interaction), Phase 1 (kernel).

**Builds:**

- Item and inventory model with stacking, slot caps and definition/instance split
- Gathering: node types, tap-to-start continuous harvest, depletion, rare-drop
  tables driven by integer weights, offline accrual with the agreed cap
- Refining and crafting stations, recipes as validated data, skill-scaled waste
- Skills and XP curves from tunables; unlock gates
- Server-side accrual and validation; client predicts, server confirms
- Telemetry event schema (the metrics in GDD §25 instrumented from day one)

**Exit criteria:**

- [ ] A gathering session replays from its seed to an identical yield
- [ ] Client prediction and server authority agree; injected divergence is detected
- [ ] Offline accrual is capped and idempotent — claiming twice yields once
- [ ] Rate limits reject a scripted harvest loop
- [ ] Economy harness projects faucet and sink rates for a 30-day simulated cohort

**Open decision:** offline accrual rate and cap (Report §7.6).

---

## Phase 4 — Cards, grading, slabs, collection, deckbuilding

**Goal:** the collection fantasy, end to end.

**Depends on:** Phase 3 (materials), content pipeline.

**Builds:**

- Content pipeline: card definitions as data, schema-validated in CI, versioned sets
- Card model with the definition/instance split; deck legality on definition ids
- Scribing: materials in, card instance out, server-resolved
- Grading: skill-scaled variance, published odds, auditable rolls
- Slabs: serials minted by a single writer, presentation, display support
- Collection browser and deck builder: search, filter, sort, drag-and-drop, instant
  legality feedback, save slots
- Localisation: all player-facing strings behind ids from the first card

**Exit criteria:**

- [ ] 150+ cards authored as data with zero schema violations in CI
- [ ] Grading distribution over 1M simulated rolls matches published odds within 0.5%
- [ ] Serial uniqueness holds under a concurrent minting test
- [ ] Deck builder is usable one-handed in portrait; legality feedback under 16 ms
- [ ] Every string is localisable; no literals in components

**Open decision:** does grade affect combat power (Report §7.1). This shapes the card
data model and must be settled before the schema freezes.

---

## Phase 5 — Combat

**Goal:** duels against AI that are tactical, fast and verifiable.

**Depends on:** Phase 4 (cards, decks), Phase 1 (kernel).

**Builds:**

- Turn engine as kernel reducers: deterministic, replayable, headless
- Effect and status systems with an explicit resolution order and a readable log
- The rules the GDD leaves open: life totals, board limits, priority, timeout
  behaviour, concession, disconnect resolution, draw conditions
- Duel presentation: camera, animation, particles within the tier budget
- AI opponents: archetype decks, scaling difficulty, deterministic decision-making
- Replay format recording seed, command log, content version and tunables version

**Exit criteria:**

- [ ] A duel replays from its log to an identical final state hash, 10,000 times
- [ ] Turn resolution under 50 ms on the Low tier
- [ ] Every card in the set has automated rules coverage
- [ ] Timeout, concession and disconnect all produce a defined, tested outcome
- [ ] AI completes a legal turn within the timer at every difficulty

---

## Phase 6 — Multiplayer, identity, persistence

**Goal:** other players, safely.

**Depends on:** Phase 5 (duel engine), Phase 3 (server-authoritative economy).

**Builds:**

- Authentication, account recovery, device migration, session binding
- Postgres persistence behind the existing repository port; Redis-backed sessions
- Hub presence: interest-managed, delta-compressed, capped per instance
- Instant challenge, matchmaking, rating
- Authoritative duel service with reconnect into an in-progress match
- Player-to-player trading with holds, confirmations and an append-only ledger
- Moderation: name filtering, allowlisted emotes, reporting, showcase review

**Exit criteria:**

- [ ] 200 concurrent players per hub instance under 40 KB/s per client
- [ ] Reconnect into a live duel within the resume window, with no state loss
- [ ] Load test: 5,000 concurrent sockets per node, p99 command latency under 150 ms
- [ ] Trade duplication test suite passes under induced network partitions
- [ ] Account recovery flow reviewed against takeover scenarios

---

## Phase 7 — Economy, market, live ops

**Goal:** a durable economy and the ability to run the game without a deploy.

**Depends on:** Phase 6 (trading, identity).

**Builds:**

- Market: listings, taxes, caps, cooldowns, price history
- Faucet/sink modelling with continuous monitoring and alerting
- Bot detection: behavioural telemetry, velocity checks, graduated enforcement
- Remote configuration for events, bonuses and seasonal content
- Leaderboards, dailies, achievements, seasonal ranks
- Payments, receipt validation, entitlements — cosmetics only

**Exit criteria:**

- [ ] Simulated 90-day economy shows no runaway inflation across three cohorts
- [ ] Market invariants (no negative balances, no orphaned items) hold under fuzzing
- [ ] Config changes take effect without a client release, with rollback
- [ ] Bot heuristics validated against a red-team scripted account

---

## Phase 8 — Optimization, accessibility, hardening, launch

**Goal:** ship it.

**Builds:** performance passes against device-tier budgets; full accessibility audit
(contrast, colour-independent rarity coding, screen reader support for 2D screens,
text scaling); security review and penetration test; crash and error reporting;
staged rollout, feature flags and rollback; runbooks and on-call.

**Exit criteria:**

- [ ] Performance budgets met on the Low tier
- [ ] WCAG 2.2 AA on all 2D screens
- [ ] Security review closed with no high-severity findings
- [ ] Rollback exercised end to end in staging
- [ ] Crash-free session rate above 99.5% in beta

---

## Cross-cutting, every phase

- **Determinism is a build gate.** Any code path affecting game state is replayable;
  the lint rules and hash tests enforce it.
- **Server is the source of truth.** The client predicts and displays; it never
  decides.
- **Content is data.** Cards, recipes, quests and dialogue are validated files, not
  code, and every one is versioned.
- **Mobile first, measured.** Every phase reports against device-tier budgets rather
  than "it feels fine on my laptop".
- **Every system serves a pillar.** GDD §26 is the test: a feature that does not
  improve progression, collection, social life, duel depth, mobile usability or
  retention is cut.

---

## Dependency graph

```
Phase 1 Foundation
   └─> Phase 2 World ──> Phase 3 Economy ──> Phase 4 Cards ──> Phase 5 Combat
                              │                    │                │
                              └────────────────────┴────────────────┴──> Phase 6 Multiplayer
                                                                              └─> Phase 7 Live ops
                                                                                     └─> Phase 8 Launch
```

Phase 2 and the Phase 4 content pipeline can proceed in parallel once the card schema
is settled — which is why the grade-versus-power decision (Report §7.1) is the
critical-path item today.
