# Project Initialization Report

**Project:** The Arcanum Academy
**Source of truth:** `arcanum_academy_master_prompt_and_gdd.md` (read in full)
**Status:** Phase 1 complete — architecture, tooling and engine scaffolding in place, no gameplay implemented
**Date:** 2026-07-31

---

## 1. Verdict

The GDD is a strong product document. The fantasy is coherent, the loops interlock,
and the pillars are the right ones for a mobile web title. It is not yet a technical
specification, and three of its gaps are the kind that are cheap to fix now and
extremely expensive to fix after launch:

1. **It never names an authority model.** It asks for determinism, real-time
   multiplayer and a player-driven market, but does not say who computes the result
   of a grading roll. If that is the client, the economy is compromised on week one.
2. **It has no identity, account or security design at all.** Slabbed cards are
   explicitly meant to hold value and be tradeable. That makes an account a wallet,
   and the document does not mention login, recovery, or device migration once.
3. **Grade is specified to affect both collection value and combat power** (§11),
   while §22 forbids pay-to-win and §18 provides a player market. Those three
   statements cannot all hold: an open market plus grade-driven power means money
   buys strength. This one needs a design decision, not an engineering fix.

Everything else below is ordinary early-project work: naming what the document
leaves implicit, and building the plumbing that all the named systems assume exists.

---

## 2. Missing systems

Systems the GDD depends on but never specifies. Each is listed with why it blocks
something already in the document.

| #   | Missing system                                                                     | Blocked by its absence                                                                             | Phase                     |
| --- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------- |
| M1  | **Authority model** — who computes gathering yields, grading rolls, duel outcomes  | The entire economy (§8), grading (§11), duels (§14)                                                | 1 (decided), 6 (enforced) |
| M2  | **Identity, authentication and account recovery**                                  | Persistence (§ "Persistence rules"), trading (§18), profiles (§16)                                 | 6                         |
| M3  | **Anti-cheat and anti-automation**                                                 | Idle gathering (§9) plus a player market (§18) is the most heavily botted combination in the genre | 6–7                       |
| M4  | **Transaction ledger and item custody**                                            | "Audit logs for duplicated serials" (§18) implies a ledger that is never designed                  | 7                         |
| M5  | **Content pipeline** — cards, recipes, quests and NPCs as validated data, not code | "Generate unique cards, NPCs, quests, dialogue…" at production scale                               | 4                         |
| M6  | **Live-ops remote configuration**                                                  | Seasonal events, "limited-time grading bonuses", weekend modifiers (§19)                           | 7                         |
| M7  | **Telemetry and analytics event schema**                                           | Every metric in §25 needs instrumentation designed before the systems ship                         | 3 onwards                 |
| M8  | **Onboarding / first-session flow**                                                | Pillar 1, "one-minute-to-fun", has no designed first ten minutes                                   | 4                         |
| M9  | **Localisation strategy**                                                          | §"Content generation" implies thousands of strings; retrofitting i18n after the fact is a rewrite  | 4                         |
| M10 | **Accessibility requirements**                                                     | A card game that encodes school and rarity in colour alone excludes ~8% of male players            | 2 onwards                 |
| M11 | **Moderation and safety for social features**                                      | Public profiles, emotes, showcases (§16) — needed before any user-visible text ships               | 6                         |
| M12 | **Payments, receipts and entitlement service**                                     | §22 monetization has no delivery mechanism                                                         | 7                         |
| M13 | **Matchmaking and rating system**                                                  | "Duel rating / seasonal rank" (§7) with no pairing or rating algorithm                             | 6                         |
| M14 | **Disconnect and concession resolution in duels**                                  | §14 has a 30-second turn timer but no rule for a player who never returns                          | 5                         |
| M15 | **Offline progression rules**                                                      | "Idle-friendly" (§9) never states what accrues while the app is closed                             | 3                         |

---

## 3. Hidden dependencies

Cross-system couplings the document treats as independent features.

- **Grading depends on the RNG authority, which depends on the network model.**
  Grading is presented as a crafting outcome, but because grade drives trade value
  it is really an economic transaction and must be resolved server-side, logged, and
  reproducible from a seed. This is why the deterministic kernel exists before any
  gameplay does.
- **"Instant challenge with no loading screen" (§14) depends on asset residency.**
  A duel that starts in under a second requires the duel scene, card frames and
  shared VFX to be resident before the challenge is issued — which constrains the
  hub's memory budget on a 4 GB Android device. The two systems must be budgeted
  together, not separately.
- **Slab serial numbers depend on a global single writer.** Serials are advertised
  as unique and are the basis of prestige. Two servers minting serials concurrently
  without a shared sequence produces duplicates, which is unrecoverable once traded.
- **The market depends on inventory being server-authoritative** — otherwise listing
  an item the client believes it owns is a duplication exploit.
- **Deck legality depends on card _definition_ identity, not card _instance_
  identity.** "Maximum 3 copies of any spell name" (§13) means the limit is on the
  definition; the collection is instances. Conflating the two produces a deck
  builder that lets a player run three copies of the same physical slabbed card.
- **Daily retention hooks (§19) depend on push notifications**, which on iOS require
  an installed PWA and are unavailable in a browser tab. A retention design that
  assumes daily pings will underperform on roughly half the target audience.
- **Balance changes depend on replay validity.** Once duels are recorded, changing a
  card's cost invalidates older replays unless every replay records the content and
  tunables version it ran against.

---

## 4. Risk register

Severity × likelihood, highest first.

| Risk                                                                    | Severity | Likelihood             | Mitigation                                                                                      | Status                                                |
| ----------------------------------------------------------------------- | -------- | ---------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **Client-authoritative RNG** lets players farm grade 10s                | Critical | Certain if unaddressed | Server-authoritative resolution; client predicts, server confirms                               | Architecture in place (ADR-0001)                      |
| **Item duplication** through trade or market races                      | Critical | High                   | Single-writer custody, idempotent transactions, optimistic concurrency, append-only ledger      | Optimistic concurrency implemented; ledger in Phase 7 |
| **Bot farming** of idle gathering feeding the market                    | High     | High                   | Server-side accrual with caps, per-account rate limits, behavioural telemetry, market friction  | Rate limiting implemented; detection in Phase 7       |
| **Grade-driven power + open market = pay-to-win**                       | High     | Certain if unresolved  | Decouple grade from combat power (§7, needs approval)                                           | **Awaiting decision**                                 |
| **Regulatory exposure** from randomised grading with tradeable outputs  | High     | Medium                 | No paid randomness; grading consumes earned materials only; publish odds; age gating            | Policy proposed (§7)                                  |
| **Account theft** once slabs hold value                                 | High     | Medium                 | Real auth, session binding, trade holds after credential change                                 | Phase 6                                               |
| **Mobile performance** — 3D hub plus presence on mid-range Android      | High     | Medium                 | Quality tiers, instanced NPCs, DPR clamp, bundle budgets, device-tier CI check                  | Tiering implemented                                   |
| **PWA platform limits** (iOS storage eviction, no tab push)             | Medium   | High                   | Server is source of truth; local storage is a cache; install prompt; email/in-app re-engagement | Storage model implemented                             |
| **Economy inflation** from unbounded faucets                            | Medium   | High                   | Faucet/sink model with a simulation harness before the market opens                             | Phase 7                                               |
| **Content scale without a pipeline** — hand-written cards in TypeScript | Medium   | High                   | Cards as validated data with CI schema checks and versioned sets                                | Phase 4                                               |
| **Save corruption / version skew across devices**                       | Medium   | Medium                 | Versioned documents, forward-only migrations, refusal to downgrade                              | Implemented                                           |
| **Scope** — the MVP list (§23) is still a year of work                  | Medium   | High                   | Recommend deferring the shared hub out of MVP (§7, needs approval)                              | **Awaiting decision**                                 |
| **Desync between client prediction and server truth**                   | Medium   | Medium                 | Canonical state hashing, resync on mismatch, command logs attached to reports                   | Implemented                                           |

---

## 5. Design conflicts found in the GDD

Places where the document contradicts itself. Each needs a decision; §7 records the
recommendation.

1. **Grade → power vs. no pay-to-win vs. an open market.** §11 says grade matters for
   combat; §22 forbids purchased combat advantage; §18 lets players buy graded cards
   for currency that §22 permits selling convenience for. Any two of these are fine.
   All three are not.
2. **Deck size: "exactly or at least a fixed 20-card format" (§7).** These are
   different games. "At least" invites deck-thinning strategies and makes draw
   probability unbounded.
3. **"Deterministic, debuggable game logic" vs. no stated authority.** Determinism
   is only valuable if two parties compute the same thing and compare.
4. **"No pay-to-win" vs. "extra deck slots" and "premium storage tabs" (§22).**
   Storage is not power, but in a game where collection breadth feeds deck quality it
   is adjacent. Worth a stated boundary rather than a case-by-case judgement.
5. **Tool durability as a sink (§8) vs. "idle-friendly" gathering (§9).** Durability
   that interrupts an idle session punishes exactly the play pattern the pillar
   promises. It works as a _currency_ sink, not as an _attention_ sink.
6. **30-second turn timer (§14) vs. mobile network reality.** A hard timer measured
   on the server will cut off players on a lossy connection. Needs a grace window,
   which the tunables now carry (`turnTimerNetworkGraceMs`).

---

## 6. Improvements applied automatically

Per the master prompt, changes that improve architecture, maintainability,
performance or scalability without altering gameplay were made without waiting for
approval. Each is implemented and covered by tests.

| Improvement                                                                                               | Why                                                                                                                                        | Where                                              |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| **Deterministic simulation kernel** with a total command ordering and canonical state hashing             | Makes server authority affordable — one rule implementation, verified by hash comparison — and turns desyncs into reproducible bug reports | `packages/sim/src/kernel.ts`, `hash.ts`            |
| **Seedable, serialisable RNG** (xoshiro128\*\*) with rejection sampling                                   | Rarity guarantees are only real if the distribution is unbiased; serialisable state lets a grading roll be re-derived and audited          | `packages/shared/src/rng.ts`                       |
| **Balance as versioned data**, not literals                                                               | Balance changes ship without a client release, and replays record the version they ran against                                             | `packages/shared/src/config/tunables.ts`, ADR-0002 |
| **Explicit phase machine** with a declared transition table, plus `Boot` and `Fault` phases the GDD omits | Prevents the classic bugs (deck builder over a duel, two loading screens racing) and makes a failed start diagnosable                      | `packages/sim/src/phases.ts`                       |
| **Duel exit routed through `Syncing`**                                                                    | The server owns the result; a client cannot leave a duel straight into the world and self-report                                           | `PHASE_TRANSITIONS`                                |
| **Executable architecture boundaries**                                                                    | Layering written only in a document decays in a month; this fails CI instead                                                               | `tools/scripts/check-boundaries.mjs`, ADR-0003     |
| **Lint rules banning `Math.random` and `Date.now` inside the simulation**                                 | Determinism is a property that must be enforced, not remembered                                                                            | `eslint.config.js`                                 |
| **Optimistic concurrency on player records**                                                              | Two devices on one account is normal in mobile; last-write-wins is how inventories disappear                                               | `packages/server/src/persistence/repository.ts`    |
| **Session resume with bounded windows**                                                                   | Phones drop sockets constantly; without resumption every lock-screen costs a reload and, mid-duel, a loss                                  | `packages/server/src/session/session-store.ts`     |
| **Full-jitter exponential backoff**                                                                       | Prevents every phone reconnecting in lockstep after a deploy                                                                               | `packages/client/src/net/transport.ts`             |
| **Outbound frame queue**                                                                                  | A tap made just before a drop is delivered rather than silently lost                                                                       | same                                               |
| **Token-bucket rate limiting per connection**                                                             | The first line against scripted market and gathering traffic                                                                               | `packages/server/src/net/rate-limiter.ts`          |
| **Device quality tiering** from measured signals, not user-agent strings                                  | Pixel-ratio clamping is the single biggest lever on mobile GPU cost                                                                        | `packages/client/src/core/device.ts`               |
| **IndexedDB with forward-only migrations** and a memory fallback                                          | `localStorage` is synchronous, string-only and ~5 MB; private browsing must not block boot                                                 | `packages/client/src/persistence/local-store.ts`   |
| **Fixed-timestep loop with bounded catch-up**                                                             | A backgrounded tab must not simulate ten minutes of backlog on return                                                                      | `packages/sim/src/clock.ts`                        |
| **WebGL context-loss recovery and visibility-gated rendering**                                            | Expected on mobile; also stops a pocketed phone burning battery                                                                            | `packages/client/src/render/renderer.ts`           |
| **Protocol envelope with version, sequence and size bounds**                                              | One parser, one validation path, one place to add tracing                                                                                  | `packages/shared/src/protocol/`                    |

---

## 7. Changes that need your approval

These alter gameplay or scope, so they are recommendations only. Nothing has been
implemented in either direction.

### 7.1 Decouple grade from combat power — **recommended**

Make grade drive collection value, cosmetic presentation and non-combat utility
(display, prestige score, trade value, cosmetic unlocks), and let a Grade 1 and a
Grade 10 of the same spell play identically.

- _Why:_ it resolves the pay-to-win contradiction without removing the market or the
  grading loop, and it protects competitive integrity permanently rather than through
  ongoing balance babysitting.
- _Cost:_ low now, high later — combat code that reads grade is hard to unpick once
  cards, AI decks and the meta assume it.
- _Preserved:_ the collection fantasy is untouched. Grading remains exciting because
  the slab is the prize.
- _If declined:_ grade-driven power needs a hard cap (for example ±10% on a single
  stat), plus separate ranked queues by grade band, plus a market that cannot list
  above-baseline cards. That is materially more work and more ongoing risk.

### 7.2 Deck size is exactly 20 — **recommended**

Resolve the §7 ambiguity in favour of exactly 20.
_Why:_ fixed size makes draw probability legible to players, makes AI deck
construction tractable, and removes thinning degeneracy.

### 7.3 Grading consumes only earned materials; no purchased randomness — **recommended**

No product may grant a grading attempt, improve grade odds, or be sold as a
randomised card container.
_Why:_ it keeps the game clear of loot-box regulation in the EU, UK, and several
Asian markets, keeps age ratings low, and is the difference between a compliance
review and a launch. Publish grade odds in-game regardless.

### 7.4 Cut the shared multiplayer hub from the MVP — **recommended**

Ship the MVP with a single-player hub populated by ambient NPCs and AI rivals.
Real-time presence, challenges and the market land in Phase 6.

- _Why:_ the MVP's stated goal (§23) is to prove `gather → craft → grade → deckbuild
→ duel`. None of that requires other players to be visible. Real-time presence is
  the single most expensive system in the document and the one most likely to slip.
- _Preserved:_ the hub still feels alive — that was always going to be carried by
  NPCs, per §1's own note about few real players being present.

### 7.5 Tool durability becomes a currency sink, not an interruption — **recommended**

Tools lose condition and cost currency to maintain, but never stop an in-progress
idle session.
_Why:_ an interruption-based sink directly attacks the "meaningful idle progression"
pillar, and it punishes the player who plays exactly as designed.

### 7.6 Offline accrual: capped, at reduced rate, claimed on return — **needs a call**

Proposed: gathering accrues offline at a reduced rate for a maximum of 8 hours
(`gathering.offlineAccrualCapMs`), claimed explicitly when the player returns.
_Why:_ uncapped accrual makes logging in optional and floods the economy; no accrual
at all contradicts "idle-friendly". The cap and rate are the two numbers that decide
how the whole economy behaves, so they should be set deliberately.

---

## 8. What Phase 1 delivered

No gameplay. The engine, the boundaries and the safety net.

**Verified green:** `npm run verify` — format, lint, architecture boundaries,
typecheck, 117 tests across 16 files, and a production client build.

- `@arcanum/shared` — branded ids with sortable ULIDs, `Result`/`Failure` taxonomy,
  deterministic RNG, typed event bus, structured logging, versioned tunables, wire
  protocol with envelope validation, forward-only migration runner.
- `@arcanum/sim` — fixed-timestep clock with bounded catch-up, canonical state
  hashing, phase state machine with a declared transition table, deterministic
  command kernel with snapshot and restore.
- `@arcanum/server` — validated environment config, transport-agnostic connection
  gateway (handshake, heartbeat, resume, rate limiting, documented close codes),
  session store, persistence port with an in-memory adapter and optimistic
  concurrency, Fastify health/readiness/version/metrics endpoints, graceful shutdown.
- `@arcanum/client` — service container, frame loop, device tiering, WebGL render
  service with context-loss recovery, pointer/gesture input service, reconnecting
  transport with queueing and jittered backoff, IndexedDB persistence with a memory
  fallback, Zustand UI store, PWA manifest and service worker, design token system,
  boot and diagnostics screens.
- Tooling — npm workspaces, TypeScript project references in strict mode with
  `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, ESLint with
  determinism rules, Prettier, Vitest, the boundary linter, and a CI pipeline that
  runs all of it plus a bundle-size report.

**Client bundle:** 39 kB app + 142 kB React + 461 kB three.js, split so 2D screens
never load the renderer. Budget for Phase 2 is set in the roadmap.

---

## 9. Recommended next step

Confirm or overrule the six decisions in §7 — particularly 7.1, which shapes the
combat data model that Phase 4 and Phase 5 both build on. Phase 2 (world rendering,
camera, movement, input) can start immediately regardless, since none of the open
decisions touch it.
