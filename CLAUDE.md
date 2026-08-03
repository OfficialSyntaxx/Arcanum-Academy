# The Arcanum Academy — Project Memory for Claude Code

> This file is the single source of truth for project context. Claude Code reads it
> automatically on startup. Keep it up to date as phases complete and decisions are made.
> Never delete it; append to it.

---

## What this project is

**The Arcanum Academy** is a mobile-first, browser-based fantasy game (PWA) combining:

- MMO-style social hub exploration
- Idle gathering and crafting
- Collectible graded spell cards with unique serials
- Deckbuilding (exactly 20 cards, max 3 copies per spell name)
- Tactical turn-based duels vs AI and real players
- Long-term prestige and collection systems

**Core fantasy:** Attend a magical academy, gather arcane resources, craft graded spell cards, build decks, and duel other students in a living shared world.

**Primary source documents (all in this repo):**

- `docs/PROJECT_INITIALIZATION_REPORT.md` — architectural review, risks, open questions
- `docs/IMPLEMENTATION_ROADMAP.md` — 8-phase build order with exit criteria
- `docs/ARCHITECTURE.md` — package structure, layer rules, dependency diagram
- `docs/adr/` — Architecture Decision Records (read all before making structural changes)
- The GDD is embedded in the master prompt the user originally provided; its full content is
  reproduced accurately in the Initialization Report and Roadmap.

---

## Operating rules (from the V2 Studio Prompt)

You are operating as the full senior development studio. Assume all roles simultaneously:
Creative Director, Executive Producer, Lead Gameplay Engineer, Principal Software Architect,
Technical Director, Senior Multiplayer Engineer, Lead UI/UX Designer, Economy Designer,
Systems Designer, AI Systems Engineer, Rendering Engineer, Performance Engineer, Database
Architect, DevOps Engineer, QA Lead, Live Service Designer, Mobile Optimization Specialist.

**Decision hierarchy (in order):**

1. Explicit user instructions given in this session
2. This CLAUDE.md file
3. Documents in `docs/`
4. Gameplay integrity
5. Architectural quality
6. Performance
7. Maintainability

**Hard rules — never violate:**

- No TODOs, placeholder logic, fake implementations, stub methods, or pseudocode
- If one system depends on another, build both or stop and explain the missing dependency
- Every generated file must compile and pass `npm run verify`
- Run `npm run verify` before declaring any task complete
- If an improvement only affects engineering quality, proceed. If it changes gameplay
  balance or economy fairness, explain the tradeoff and ask first.
- Before each meaningful coding step: summarise the objective, list systems involved,
  list dependencies, state the approach, then implement.

---

## Workspace layout

```
arcanum-academy/
├── packages/
│   ├── shared/     @arcanum/shared  — ids, Result, RNG, tunables, protocol, world content
│   ├── sim/        @arcanum/sim     — deterministic kernel, pathfinding, locomotion, NPCs
│   ├── server/     @arcanum/server  — gateway, session store, persistence port, health endpoints
│   └── client/     @arcanum/client  — React 18, three.js, Vite PWA, Zustand
├── tools/scripts/check-boundaries.mjs  — executable architecture linter (fails CI on violations)
├── docs/           — ADRs, roadmap, initialization report, architecture
└── CLAUDE.md       — this file
```

**Dependency direction (enforced by the boundary linter):**

```
shared → (nothing)
sim    → shared
server → shared, sim
client → shared, sim
```

**Key npm scripts:**

```bash
npm run verify        # format:check + lint + boundaries + typecheck + test — run before every commit
npm run dev           # Vite dev server (client)
npm run dev:server    # ts-node server
npm run test          # vitest run
npm run build         # production build (client + server tsc)
npm run boundaries    # architecture boundary linter only
```

**Current test count: 344 tests across 27 files — all passing.** First verified end to
end on 2026-08-02; before that the suite had never been run to completion on any machine
or in CI.

---

## Technology stack

| Concern        | Choice                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| Runtime        | Node 22 (`.nvmrc`)                                                                                     |
| Language       | TypeScript 5 strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`) |
| Client bundler | Vite 6 + vite-plugin-pwa                                                                               |
| 3D             | three.js r171                                                                                          |
| UI             | React 18 + Zustand 5                                                                                   |
| Server         | Fastify 5 + ws 8                                                                                       |
| Validation     | zod 3                                                                                                  |
| Testing        | Vitest 2                                                                                               |
| Linting        | ESLint (flat config) + typescript-eslint                                                               |
| Formatting     | Prettier                                                                                               |
| RNG            | Custom xoshiro128** (deterministic, seedable, serialisable)                                            |

**Critical ESLint rules:**

- `Math.random` is banned inside `packages/sim` — use `Rng` from `@arcanum/shared`
- `Date.now` is banned inside `packages/sim` — use the injected clock
- `consistent-type-imports` is enforced everywhere

---

## Architecture decisions (read all ADRs in `docs/adr/`)

### ADR-0001: Server-authoritative deterministic simulation

The server owns all outcomes. Client and server share `@arcanum/sim` — identical logic, no
duplication. Client predicts locally, server verifies by state hash comparison. A mismatch
triggers a resync, not a disconnect.

### ADR-0002: Balance lives in versioned data

Every tunable number lives in `DEFAULT_TUNABLES` in `packages/shared/src/config/tunables.ts`.
Gameplay code never hardcodes a literal. The tunables version is recorded in match replays.

### ADR-0003: Architecture boundaries are executable

`tools/scripts/check-boundaries.mjs` is a real linter that reads imports and fails CI when a
module crosses a layer it shouldn't. It is not documentation — it is enforcement. Run
`npm run boundaries` to check. Adding a new layer requires updating both the script and this file.

### ADR-0004: Grade does not affect duel resolution

Card data is split into:

- `CardDefinition` — rules (cost, effects, school, type). The ONLY data the combat resolver reads.
- `CardInstance` — provenance (grade, serial, foil, slab state, owner). Never read by the resolver.

Grade affects post-match rewards via `rewardMultiplierMinBasisPoints` /
`rewardMultiplierMaxBasisPoints` in tunables. Grade 9-10 slabs get presentational duel advantages
(distinct card back, reveal flourish, serial visible) — never mechanical ones.

A boundary rule will explicitly forbid the `combat` module from importing `CardInstance`.

---

## What has been built

### Phase 1 — Foundation (complete, 117 tests at time of completion)

- `@arcanum/shared`: branded ids, Result/Failure, xoshiro128** RNG, typed EventBus, structured
  logger, versioned tunables (world + combat + grading + economy + progression + gathering +
  network), wire protocol with envelope + opcodes, forward-only migration runner
- `@arcanum/sim`: fixed-timestep clock, canonical FNV-1a state hash, explicit phase state
  machine (Boot/Loading/Syncing/WorldExploration/IdleGathering/Crafting/DeckBuilding/CardCombat/
  Market/QuestDialog/Paused/SocialHub/Fault), deterministic command kernel with snapshot/restore
- `@arcanum/server`: zod-validated env config, transport-agnostic Gateway with handshake/
  heartbeat/resume/rate-limiting/sweep, SessionStore, InMemoryPlayerRepository with optimistic
  concurrency, Fastify health endpoints (/healthz /readyz /version /metrics), graceful shutdown
- `@arcanum/client`: lazy DI Container, device quality tiering (Low/Medium/High), Engine with
  fixed-timestep + EMA fps, WebGL RenderService with context-loss recovery + visibility gating,
  gesture InputService (tap/longpress/drag/pinch), reconnecting Transport with full-jitter
  backoff, IndexedDB persistence with LOCAL_SCHEMA_VERSION + migrations, Zustand AppState,
  PWA manifest + icons, design tokens (IBM Plex type family, 9-colour palette)
- Tooling: TS project references, ESLint flat config with determinism rules, Prettier, Vitest,
  executable boundary linter, GitHub Actions CI

### Phase 2 — World, camera, input, NPCs, accessibility (complete, 162 tests)

**In `@arcanum/shared`:**

- `world/types.ts`: Zone, Waypoint, Interactable (9 kinds), NpcDefinition, ScheduleEntry,
  NpcActivity, NpcRole, ZoneTerrain (base + terraces), Vec2, distance helpers
- `world/graph.ts`: `buildNavGraph()` — validates zones exhaustively (symmetry, connectivity,
  bounds, schedule ordering, interactable approach validity) and compiles waypoints into a
  flat typed-array nav graph. Fails fast with structured errors.
- `world/courtyard.ts`: `COURTYARD` — the Courtyard of the Arcanum hub zone. 28 waypoints,
  13 interactables, 6 named NPCs (Professor Vosk, Quartermaster Vell, Archivist Onn,
  Rival Renn, Groundskeeper Bram, Referee Dun), 18 ambient population. Cross-plan layout
  with scribing hall, duelling terrace, merchant arcade, alchemy gardens, library, mines,
  hall of champions, emberwood grove.
- Tunables extended: WorldTunables (speeds, camera, NPC dwell), grade reward multipliers

**In `@arcanum/sim`:**

- `nav.ts`: `Pathfinder` class — allocation-free A* over integer indices, binary heap,
  index tie-breaking for determinism. `between()` for world-point-to-world-point routing.
- `locomotion.ts`: `Mover`, `followPath()` (with carry-over past multiple nodes per step),
  `steer()` (analogue, scales speed by stick magnitude, clamps to zone bounds),
  `setPath()` (drops start node if already there), `turnToward()`, `normaliseAngle()`
- `schedule.ts`: `worldMinuteOf()`, `worldDayFractionOf()`, `currentScheduleEntry()`,
  `minutesUntilNextEntry()`, `selectBark()` (deterministic, seeded by NPC id)
- `npc.ts`: `NpcAgent`, `createNpcAgent()` (spawns at correct schedule post),
  `stepNpcAgent()` (schedule change → repath, walking → followPath, dwell → drift)

**In `@arcanum/client`:**

- `world/palette.ts`: 3D palette matching CSS tokens, atmosphere presets, `sunElevation()`,
  `daylight()`
- `world/scene-builder.ts`: `buildZoneGeometry()` — derives entire courtyard geometry from
  zone data. Instanced columns, spires, interactable markers, duel inlays. 2 draw calls for
  all repeated geometry.
- `world/actor-pool.ts`: `ActorPool` — fixed-capacity instanced mesh pool (bodies + heads),
  acquire/release/setTransform/flush. 2 draw calls for the whole population.
- `world/world-service.ts`: `WorldService` — zone load + validation, geometry, actor pool,
  directional sun + hemisphere sky, `nearestInteractable()`, `updateAtmosphere()`
- `camera/camera-rig.ts`: `CameraRig` — exponential smoothing, yaw/pitch orbit, pinch zoom,
  `frame()` for shot composition (duel entry), `release()`, portrait FOV
- `input/joystick.ts`: `Joystick` — floating stick (base follows thumb beyond radius),
  dead-zone rescaling, multi-pointer safe, `visual()` for rendering
- `player/player-controller.ts`: `PlayerController` — arbitrates stick vs tap-to-move,
  `moveTo()` (via graph then final metre), `approach()` (to interactable waypoint), `step()`
  (stick input rotated by camera yaw, walk vs run threshold)
- `npc/npc-director.ts`: `NpcDirector` — named cast from zone + generated ambient crowd,
  seeded to quality-budgeted pool capacity, `nearestNamed()` for dialogue prompts
- `a11y/preferences.ts`: `AccessibilityPreferences`, `readSystemPreferences()` (seeds from OS),
  `applyAccessibility()` (projects onto `PreferenceTarget`), `motionScale()`
- `app/hub-controller.ts`: `HubController` — wires world/player/camera/NPCs/input, throttled
  store projection (250ms), `engagePrompt()`, `setAccessibility()`
- `state/app-store.ts`: extended with `InteractionPromptState`, `worldMinute`,
  `ambientPopulation`, `accessibility`
- `screens/HubScreen.tsx`: hub overlay (HubHud + JoystickPad + InteractionPrompt)
- `ui/HubOverlay.tsx`: `HubHud` (zone name, clock, population), `InteractionPrompt` (verb button)
- `ui/JoystickPad.tsx`: React wrapper for `Joystick`, pointer-capture on zone div
- CSS: hub overlay, joystick, prompt button, accessibility data-attribute hooks,
  `--text-scale` custom property

**Visual identity:** "the card slab" — palette: `--ink #11161d`, `--slate #1b2531`,
`--slate-raised #24303f`, `--haze #c6cfd8`, `--haze-dim #8496a8`, `--verdigris #3fa88e`,
`--gilt #c9a227` (grade 9-10 only), `--alarm #d0524a`. Type: IBM Plex Serif (body),
Sans Condensed (labels), Mono (serials).

---

## Resolved decisions

### Grading and purchased randomness — RESOLVED 2026-07-31

**Decision:** Earned-only. Grading may only consume materials the player gathered and
crafted — never purchased randomness (reroll items, bonus seals bought with premium
currency). Purchased randomness on grade outcomes is a loot box under UK, Belgian, Dutch,
and increasingly other regulatory regimes — requires age gating, odds disclosure, and in
some markets cannot ship at all. This holds the compliance surface at zero and is
consistent with V2 §22 (cosmetics as the primary premium value). If premium materials
ever enter the grading chain in the future, that must be a new, explicit, documented
decision — this one does not grandfather it in.

**Impact:** Item definition schema and crafting recipe format must not include any
premium-currency-purchased input that affects grade odds.

### Tool durability — RESOLVED 2026-07-31

**Decision:** Currency sink only. A tool breaking mid-harvest never interrupts an active
idle session — the session the player set up before closing the app runs to completion
or its normal cap. Durability at zero instead reduces the resource gain of the _next_
session until the tool is repaired. Avoids the most-complained-about idle-game pattern
(silent interruption of unattended progress).

### Offline accrual rate and cap — RESOLVED 2026-07-31

**Decision:** Offline gathering accrues at **25% of the online rate**, capped at 8 hours
(`offlineAccrualCapMs: 28_800_000`, already in tunables). Deliberately on the low end of
the originally-proposed 50-60% range, at the owner's explicit direction, to more strongly
incentivize active play over idling. Accrual is claimed explicitly when the player opens
the app — never silently applied — so nothing is lost to an unopened session before the cap.

---

## Deployment

Live as of 2026-08-01. Both services redeploy automatically on every push to `main`.

- **Client** — https://arcanum-academy.netlify.app (Netlify, config in `netlify.toml`)
- **Server** — https://arcanum-server-be28.onrender.com (Render free plan, config in `render.yaml`)

The split is forced by architecture, not preference: the gateway holds persistent
WebSocket connections for session resume and heartbeats, so it needs a long-running
process. No serverless platform can host it, Netlify Functions included.

**Two environment variables tie them together, and both are easy to get wrong:**

- `VITE_SERVER_URL` on Netlify — read at build time by `App.tsx`, so **changing it
  requires a rebuild, not just a save**. Must be `wss://`, never `ws://`: a page served
  over HTTPS is forbidden by the browser from opening an insecure WebSocket.
- `ALLOWED_ORIGINS` on Render — must exactly match the client origin. A wrong value
  silently refuses every browser connection in production and looks like a network
  fault rather than a config error.

- `DATABASE_URL` on Render — Postgres connection string. **Unset, player progress
  lives in memory and is destroyed on every restart**, which on a free instance means
  roughly every fifteen idle minutes. The server refuses to start if the variable is
  set but the database is unreachable, rather than falling back to memory and looking
  healthy while losing every write.

Unset, `VITE_SERVER_URL` falls back to `ws://localhost:8787`, so local development
needs no configuration at all. `DATABASE_URL` behaves the same way: absent means the
in-memory repository, which is what the tests and local development want.

**The server is bundled, and that is deliberate.** `packages/server/scripts/bundle.mjs`
produces a single ESM file via esbuild. The workspace sets `moduleResolution: "Bundler"`
and `@arcanum/shared` publishes TypeScript source, which Node cannot resolve at runtime -
it does not rewrite the `.js` specifiers the NodeNext convention requires into the `.ts`
files that exist. Bundling follows that decision instead of forcing a second module
strategy onto half the monorepo, and the single-file artifact starts fast on a free
instance. Runtime dependencies (fastify, ws, zod) stay external.

The free Render instance sleeps after roughly fifteen minutes idle and cold starts in
30-60 seconds. Fine for a demo link; revisit before real players arrive.

---

## Phase 3 — Economy (complete, 279 tests)

**In `@arcanum/shared`:**

- `items/types.ts`, `gathering/types.ts`, `crafting/types.ts`, `skills/types.ts` — the
  economic vocabulary. Items split `ItemDefinition` (rules) from `ItemInstance`
  (per-copy provenance) exactly as ADR-0004 splits cards; only tools need instances
  because materials stack.
- `content/catalogs.ts` — validators in the `buildNavGraph` mould: problems gathered and
  reported together, distinct reason codes for empty/duplicate. They take **every zone**,
  not one, which also catches an interactable id colliding across zones.
- `content/data/*.json` — the authoring format, inside `src` because the package compiles
  with `rootDir: "src"`. Compiled to frozen catalogs at import; bad content throws at
  module load rather than mid-harvest.
- `xpForLevel` / `levelForXp`, `wasteRateBasisPoints`.

**In `@arcanum/sim`** (here, not the server, so client prediction and server authority
run identical code per ADR-0001):

- `economy/inventory.ts` — stack/slot arithmetic. Adding tops up partial stacks first;
  removing drains smallest-first and releases emptied slots. Ties break on slot index so
  results never depend on sort stability.
- `economy/gathering.ts` — seeded harvest resolution. A session is a seed and a tick
  count, never rolled results, so it replays identically. Offline accrual **stretches the
  interval** rather than shrinking yields, keeping rare drops as rare offline as online.
  Depletion is evaluated per tick against that tick's timestamp, so one offline claim can
  span deplete → regrow → work again. Neither a worn tool nor a full bag halts a session.
- `economy/crafting.ts` — waste rolled per output unit; inputs consumed before the room
  check so refining works with a full bag, but room confirmed before the roll so
  ingredients are never destroyed for nothing.
- `economy/skills.ts` — level derived from cumulative XP, never stored alongside it.

**In `@arcanum/server`:**

- `domain/player-state.ts` — the shape of the opaque blob. Parsing is **total**: anything
  unrecognised becomes a default, because locking a player out over one strange field is
  worse than losing a regrowth timer.
- `domain/player-service.ts` — load/mutate/save under optimistic concurrency with a
  bounded retry, because `Gateway.receive` does not serialise commands per player.
- `net/handlers/economy.ts` — `player.sync`, `gathering.start/collect/claimOffline/stop`,
  `crafting.craft`. Catalogs are **injected**, not imported, so the composition root stays
  the only place choosing live content.
- `persistence/postgres-repository.ts` — optimistic concurrency enforced by a conditional
  `UPDATE`, not read-then-compare.

**In `@arcanum/client`:**

- `app/economy-controller.ts` — sends commands, applies `Patch` frames. Syncs on
  `HandshakeAccepted`, not on socket open: an open socket is not an authenticated one.
- `ui/EconomyPanels.tsx` — satchel, gathering readout, verbatim refusal notice.

**No local prediction yet, deliberately.** Every number shown is server-confirmed. The
rules to predict with already live in `sim`, so adding it is a change in one file.

### Deliberate deferrals from Phase 3 — read before assuming these were forgotten

- **Tools cannot be acquired.** They are fully modelled, validated and exercised by
  tests: `ToolProperties`, durability spend, and the reduced yield of a worn tool all
  work. They are simply never granted, because `repairCost` is denominated in a currency
  that does not exist until Phase 7. Granting an unrepairable tool would hand every
  player a strictly worsening bonus — 500 durability is roughly 25 minutes of active
  play, after which it is permanently halved. The quartermaster's stall is already
  placed in the Courtyard and is where acquisition and repair belong.
- **`ClientOpcode.PresenceUpdate` acknowledges and does nothing else.** Other players in
  the hub are Phase 6; the opcode exists so the protocol does not have to change then.
- **Crafting has no duration.** `craftDurationMs` is authored and validated but a craft
  resolves immediately. A timed craft needs the same pending-claim machinery as offline
  gathering, and building it before there is a reason to wait would be ceremony.

---

## Phase 4 — Cards, grading, slabs, collection (complete, 344 tests)

**Schools are content, not a code enum:** Resonance, Verdance, Ember, Cipher, in
`content/data/schools.json`. Each has a home in the Courtyard and a material line;
Cipher deliberately has neither and is scribed from refined inks alone, which is what
gives crafting a purpose beyond materials. Each carries a **glyph as well as a colour**
and the validator refuses two schools sharing either — colour is never the only carrier
of meaning (risk M10).

**Built:**

- `cards/types.ts` — the ADR-0004 split made real. `CardDefinition` is rules;
  `CardInstance` is grade, serial and provenance. Effects are data so the Phase 5
  resolver is one interpreter rather than a branch per card, and magnitudes must be
  integers because fractions cannot hash identically across platforms.
- `cards/grading.ts` — appraisal over a window whose centre rises with skill and whose
  width narrows to a floor. **Odds are derived from the same window the roll uses**, so
  the published table cannot drift from the implementation; a million simulated rolls
  are held against it at four skill levels.
- `cards/deck.ts` — exactly twenty, at most three copies, counted on **definition ids**.
- `sim/economy/scribing.ts` — materials in, one graded card out. No waste roll: a
  scribed card always exists, its quality is the variable.
- `server/domain/serial-minter.ts` — one atomic statement. Minting happens **outside**
  the state mutation because a retried write must not re-mint; the cost is a gap in the
  sequence, chosen over a duplicate or an inflated count.
- `content/strings.ts` — every player-facing string behind a key, missing keys falling
  back to the key itself so an untranslated card looks wrong rather than vanishing.
- `deck.save` re-asserts legality and ownership server-side; the builder's check is an
  affordance, not the rule.
- Client: collection browser and deck builder on one surface with the scribing table.

**Balance decisions worth revisiting:** a master slabs roughly half their work and
reaches grade 10 about one time in eight. Set by `noviceCentreScore`,
`masterCentreScore`, `baseVariance` and `minVariance`.

**Still open in Phase 4:**

- **Card count.** 20 authored against a roadmap target of 150+. Deliberately held: cards
  should be balanced against a resolver that exists, and that is Phase 5.
  Schools are named Stone, Bloom, Flame and Aether. Deck slots are named, capped at
  `combat.maxSavedDecks`, and deletable.

---

## Phase roadmap summary

| Phase | Status      | Description                                               |
| ----- | ----------- | --------------------------------------------------------- |
| 1     | ✅ Complete | Foundation, toolchain, deterministic kernel               |
| 2     | ✅ Complete | World, navigation, camera, input, NPCs, accessibility     |
| 3     | ✅ Complete | Inventory, gathering, crafting, skills, content pipeline  |
| 4     | ✅ Complete | Card framework, grading, slabs, deckbuilder               |
| 5     | 🔵 Next     | Combat engine, AI opponents, duel flow                    |
| 6     | ⬜ Planned  | Multiplayer lobby, trading, matchmaking, reconnect        |
| 7     | ⬜ Planned  | Economy, marketplace, quests, daily systems, leaderboards |
| 8     | ⬜ Planned  | Optimisation, QA, analytics, deployment, scaling          |

---

## Key content: the Courtyard of the Arcanum

**Zone id:** `zone.courtyard`
**Layout:** Cross-plan — central plaza, four cardinal avenues, four corner precincts.
**Waypoints:** 28 (plaza ring, scribing hall, duelling terrace, merchant arcade, alchemy
gardens, library, resonance mines, hall of champions, emberwood grove)
**Interactables:** scribing table, appraisal desk, crystal node (mines), mushroom patch
(gardens), emberwood stand (grove), ink distillery (gardens), crystal grinder (mines entry),
2× duel circles, quartermaster stall, consignment board (level 5+), champions pedestals,
quest board
**Named NPCs:** Professor Ilyra Vosk (scribing), Quartermaster Vell (merchant), Archivist Onn,
Rival Sable Renn, Groundskeeper Bram, Referee Calla Dun

---

## Multiplayer philosophy (for Phase 6)

Single-player hub with ambient NPCs and AI rivals ships first (current state). The transport,
gateway, session resume and server-authoritative kernel are already built and ready. Phase 6
adds the hub multiplayer layer on top of an already-working single-player experience.

---

## How to get started in Claude Code

```bash
# From the repo root:
npm install          # install all workspaces
npm run verify       # confirm everything passes (should be 344 tests)
npm run dev          # start the Vite dev server
```

Read `docs/IMPLEMENTATION_ROADMAP.md` and `docs/ARCHITECTURE.md` before writing any Phase 3 code.
Check all four ADRs in `docs/adr/` before making any structural change.
Run `npm run verify` before every commit.
