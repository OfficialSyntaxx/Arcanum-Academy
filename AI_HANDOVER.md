# AI HANDOVER — the full vision, the full feature set, and how to build it

**Written:** 2026-09-09 · **Author:** Claude Code, from a full read of all four repositories
**Owner:** Syntaxx (`OfficialSyntaxx`) · **Status:** canonical. This document supersedes the
project docs in the other three repositories.

---

## 0. How to use this document

You are almost certainly an AI agent — Claude Code, Codex, or a successor — picking this up
cold. The owner works **mostly from a phone**, directing you and one other AI. He does not
write the code himself, does not have a Mac in the loop, and does not want to spend money on
anything beyond the two AI subscriptions. Every decision below is downstream of those facts.

Read §1–§4 before touching anything. §11 tells you what already exists and where to take it
from. §12 is a list of traps that have already cost real time in these repositories — read it
before you write code, not after.

**The prime directive:** this is a **long-running project**. The owner is not chasing a ship
date; he is building something he will keep adding to for years. That means architecture,
determinism and test discipline are not overhead — they are the thing that makes year three
possible. Do not trade them for speed.

**When this document and the code disagree, the code is the truth and this document is a
bug.** Fix it in the same commit.

---

## 1. The game

### 1.1 One paragraph

A **mobile-first, browser-based, isometric fantasy RPG built on OSRS's design philosophy**:
you wash up with nothing, and everything you own you gathered, made, or killed something for.
Deep skill progression, tick-based combat you read rather than react to, a hand-built world
you walk through, and a grind that is the point rather than an obstacle. It installs to an
iPhone home screen as a PWA — **no App Store, ever**. Single-player at launch, architected so
multiplayer is a milestone rather than a rewrite.

### 1.2 The core fantasy

**Self-reliance.** The player's satisfaction comes from the chain being unbroken: *I mined
that ore, I smelted that bar, I forged that sword, I killed that thing with it.* Nothing was
bought. Nothing was given. This is OSRS Ironman as a design philosophy rather than an
opt-in mode — see §7.

### 1.3 Design pillars

These settle arguments. When a proposed feature conflicts with one, the pillar wins.

1. **Everything is earned.** No purchased power, no purchased randomness, no trading at
   launch. If a player has it, they made it. This is the identity of the game.
2. **The grind is the game, so the grind must feel good.** Tight feedback, readable numbers,
   visible progress, and something worth looking at while you do it. A boring grind is a bug.
3. **It has to run beautifully in your hand.** Mobile is the design constraint, not a port
   target. If it doesn't hold up on an iPhone in Safari, it doesn't exist.
4. **Deep numbers, legible surface.** OSRS-grade maths underneath; a UI that never makes you
   read a wiki to understand what just happened.
5. **Built single-player, shaped for multiplayer.** The simulation is written as if a server
   owned it — because one does — so adding other players is a feature, not a rebuild.
6. **A world worth being in.** Hand-composed spaces with real landmarks, not a procedural
   tile plane. If you can look around and no frame is worth a screenshot, the zone isn't done.

### 1.4 What this game is NOT

Recorded because each of these was tried or considered in a previous repository, and the
reversal is deliberate:

- **Not a card game.** Spell cards, schools of magic, grading, slabs, deckbuilding and
  card-based duels are **CUT**. (Decision 2026-09-09, owner.) See §3.7.
- **Not a Wizard101 pastiche.** The magic-academy framing goes with the cards.
- **Not a colony/settlement sim.** Oakenfall's villager-labour simulation is not the core
  loop. It may return, much later and much smaller, as a personal player-owned hold (§3.5).
- **Not an idle game.** Offline accrual exists as a courtesy, not as a progression path.
- **Not free-to-play-shaped.** No ads, no IAP-for-power, no loot boxes, no live-service
  treadmill. Cosmetics only, if anything, and only much later.
- **Not a Unity game.** See §4.2 for the full reasoning. This is settled; do not reopen it
  without reading that section.

---

## 2. The player experience

### 2.1 The core loop

```
explore  →  gather  →  refine/craft  →  equip/consume  →  fight  →  loot  →  explore further
              ↑                                                              │
              └──────────── unlocks better nodes, recipes, zones ────────────┘
```

Everything happens **in the world**. You walk to a rock to mine it. You walk to a furnace to
smelt. You walk to a monster to fight it. Menus are for inventory, stats and settings — never
for the activity itself. This is the single most important rule about the loop, and it is the
one previous projects broke: *if an activity can be done from a menu, it will be, and then
the world is decoration.*

### 2.2 Session shapes

The game must be good at all three:

| Session | Length | What it looks like |
|---|---|---|
| **A check-in** | 2–5 min | Claim offline accrual, bank a load, start a new gathering run, log off. |
| **A real session** | 20–45 min | A skilling goal (a level, a full inventory of a new material) or a combat goal (a boss, a dungeon floor, a drop). |
| **A long haul** | 1 hr+ | A quest chain, a clue trail, a full gear upgrade path from ore to equipped. |

### 2.3 The progression arc

1. **Castaway** (0–1 hr) — no gear, no skills. Chop, mine, fish, cook. First bronze tools,
   first weapon, first monster killed. The onboarding chain (§3.9) covers this.
2. **Apprentice** (1–10 hr) — the second zone opens. Combat becomes real. Gear tiers matter.
   First quest chain. First dungeon floor.
3. **Journeyman** (10–50 hr) — mid-tier skills, multi-step crafting chains, clue scrolls,
   the third and fourth zones, the first boss.
4. **Veteran** (50 hr+) — high-level gathering nodes, rare drop chases, mastery, the
   endgame dungeon, achievement completion.
5. **Post-max** — collection logs, achievement diaries, prestige (§3.6), and eventually
   other players.

---

## 3. The complete feature catalogue

Every feature the game wants, tiered by when it lands. **Tier 1 = the vertical slice; the
game is not a game without these. Tier 2 = launch. Tier 3 = post-launch. Tier 4 = someday,
recorded so it isn't lost.**

Each entry names where an implementation or design already exists (§11 is the full map).

### 3.1 World & movement — Tier 1

| Feature | Notes | Source |
|---|---|---|
| Hand-authored zones | Not procedural. Composed landmarks, real elevation, sightlines. | Arcanum `world/courtyard.ts` pattern; isorpg `docs/WORLD_LAYOUT.md` |
| Zone graph & travel | Zones connect by exits; travel is local, never a network round trip. | Arcanum `world/zone-catalog.ts` (4 zones exist) |
| Nav mesh / waypoint graph | Validated at build: symmetry, connectivity, bounds, reachability. | Arcanum `world/graph.ts` — `buildNavGraph()` |
| A* pathfinding | Allocation-free, integer indices, deterministic tie-breaking. | Arcanum `sim/nav.ts`; isorpg `AStar` |
| Tap-to-walk | **The primary control.** See §5. | Arcanum `player-controller.ts` (`moveTo`, `approach`) |
| Camera: rotate + pinch zoom | Free yaw, constrained pitch band. See §5. | Arcanum `camera/camera-rig.ts` (needs rework) |
| Interactables | 9+ kinds; contextual prompt with a verb; walk-then-act. | Arcanum `world/types.ts`, `hub-controller.engagePrompt()` |
| Collision | Obstacle shapes + a resolver; the player cannot walk through the world. | ALA `structures.js` resolver (design only — port, don't copy) |
| Day/night cycle | World clock, sun elevation, atmosphere presets. | Arcanum `world/palette.ts`; Oakenfall `renderLighting` |
| Seasons & weather | Rain/snow/clear, seasonal resource availability. | Oakenfall `rollWeather` + puddles/snow accumulation; ALA `weather.js`, `seasons.js` |
| Zone streaming | Chunked loading for larger zones. | ALA `WORLDSPEC.md` §5–6 (the design is good; the code is not) |
| Minimap | | Oakenfall |

### 3.2 Skills & gathering — Tier 1

**The skill list (12 to start, extensible):**

| Skill | Kind | Drives |
|---|---|---|
| Woodcutting | gathering | TREE nodes |
| Mining | gathering | ROCK nodes |
| Fishing | gathering | WATER nodes |
| Cooking | artisan | Food from raw catches/meat |
| Smithing | artisan | Ore → bar → equipment |
| Carpentry | artisan | Logs → planks → furniture/tools |
| Construction | artisan | Building (the hold, §3.5) |
| Farming | artisan | Crop plots, growth timers |
| Attack | combat | Accuracy |
| Strength | combat | Max hit |
| Defence | combat | Damage avoidance |
| Hitpoints | combat | Health pool |

Extensible later: Herblore/Alchemy, Fletching, Runecrafting-equivalent, Hunter, Thieving,
Slayer. **Do not add a skill until there is a full content chain for it** — a skill with
three levels of content is worse than no skill.

| Feature | Notes | Source |
|---|---|---|
| XP curve & levels | Level derived from cumulative XP, never stored beside it. | Arcanum `sim/economy/skills.ts`; isorpg `data/XPTable.ts` |
| Resource nodes | Per-node level req, XP, yield table, depletion, regrowth timers. | Arcanum `content/data/nodes.json`; isorpg `data/Skills.ts` `ResourceDrop` |
| Seeded harvest resolution | A session is a **seed + tick count**, never rolled results, so it replays identically. | Arcanum `sim/economy/gathering.ts` |
| Rare finds | A small chance of a valuable variant per gather. | ALA "Pristine" mechanic |
| Tools & durability | Better tools = faster/better yield. Durability is a **currency sink**: a broken tool never interrupts a session, it reduces the *next* one until repaired. | Arcanum (modelled, not yet granted — see §11.1) |
| Inventory / bag | Stack + slot arithmetic. Top up partial stacks first; drain smallest-first; ties break on slot index. | Arcanum `sim/economy/inventory.ts` |
| Bank | Deposit/withdraw, tabs, search. **Not yet built anywhere.** | — |
| Offline accrual | 25% of online rate, 8 hr cap, **claimed explicitly** on open, never silently applied. | Arcanum (`offlineAccrualCapMs`) |

### 3.3 Crafting & the production chain — Tier 1

| Feature | Notes | Source |
|---|---|---|
| Recipes | Inputs → outputs, level req, station req, XP. Data, not code. | Arcanum `content/data/recipes.json` |
| Multi-step chains | ore → bar → equipment; log → plank → furniture. The chain is the content. | isorpg `data/Recipes.ts` |
| Waste / failure rolls | Rolled per output unit; inputs consumed before the room check, room confirmed before the roll, so ingredients are never destroyed for nothing. | Arcanum `sim/economy/crafting.ts` |
| Crafting stations | Furnace, anvil, workbench, range, loom — placed in the world, walked to. | Arcanum interactables |
| Cooking + burn chance | Level-scaled burn rate; food heals in combat. | isorpg `data/Recipes.ts`; ALA `cooking.js` |
| Farming plots | Plant, growth timers across real time, harvest, disease/yield variance. | isorpg `FarmSystem.ts` |
| Item mastery | Per-item use counters that unlock small bonuses. | isorpg |

### 3.4 Combat — Tier 1

**OSRS-style, tick-based.** Not card-based. Not action/reflex-based.

| Feature | Notes | Source |
|---|---|---|
| Tick loop | 600 ms tick. Everything resolves on it. | isorpg `TickRunner` |
| Accuracy & max-hit rolls | The OSRS formula shape: attack roll vs defence roll, then a damage roll. | isorpg `CombatSystem.ts` (TS) / `Combat.cs` (C#) — **fully ported and parity-tested both ways** |
| Three attack styles | Accurate (+accuracy, trains Attack) / Aggressive (+max hit, trains Strength) / Defensive (+defence, trains Defence). Constant Hitpoints trickle. | isorpg `data/Combat.ts` `ATTACK_STYLES` |
| Combat triangle | Melee / Ranged / Magic-equivalent. **Magic must be re-themed** now that schools are cut — see §14 Q3. | — |
| Resolve (special resource) | A limited buff resource spent for a short combat edge, restored by resting at a campfire. Gives food a rival for bag space. | isorpg `data/Combat.ts` `BuffId` |
| Weapon specials | Six defined. A guaranteed special **skips the accuracy draw** — draw order is part of the contract (§12). | isorpg |
| Monster affixes | Three defined; an affix roll takes one value on failure and two on success. | isorpg |
| Weighted drop tables | Per-monster, with tertiary rares. A tertiary that misses takes no quantity draw. | isorpg `data/Combat.ts` |
| Food & healing | Eat to heal, costs a tick. | isorpg |
| Death & penalty | Tiered by zone: no penalty in town → drop unequipped inventory in dangerous zones. | isorpg GDD |
| Boss encounters | Enrage phases, slam attacks, multi-phase behaviour. | isorpg; ALA `archetypes.js` (design) |
| Aggression / safe zones | Which monsters attack on sight, and where they can't. | — |

### 3.5 Content systems — Tier 2

| Feature | Notes | Source |
|---|---|---|
| Quests | Chains with prerequisites, objectives, rewards; **pays once**, guaranteed by test. | isorpg `QuestSystem.ts`; ALA `zonequests.js` (content) |
| Dialogue & NPCs | Named cast with schedules, activities, deterministic barks seeded by NPC id. | Arcanum `sim/schedule.ts`, `sim/npc.ts` |
| Ambient population | Instanced crowd, budgeted by device quality tier. | Arcanum `npc/npc-director.ts`, `world/actor-pool.ts` |
| Shops | Buy/sell with a min-coin floor. **Ironman-limited** — see §7. | isorpg `ShopSystem.ts` |
| Clue scrolls | Three tiers, a trail of steps, a reward casket with its own draw order. | isorpg `ClueSystem.ts` |
| Dungeons | Fixed hand-placed layouts (deliberately not procedural), per-floor monster pools and chests, locked doors keyed to quest progress, persistent room/kill progress. | isorpg `DungeonSystem.cs` |
| Achievements / diaries | Derived from the save on read, never tracked separately, so they cannot drift. | ALA `codex.js`, `achievements.js` |
| Collection log | Every item and where it comes from. | isorpg "compendium" (Phase 19) |
| Titles | Unlocked by achievements, equippable. | ALA |
| The player's hold | A personal, instanced home you build and upgrade with Construction. Rooms with function: workshop, forge, kitchen, garden, storage. **This is where Oakenfall's village logic eventually returns**, scoped to one player's plot. | Oakenfall `BUILD_DEFS`; isorpg GDD housing; ALA `dorm.js` |
| Pets | Rare drops from skilling/bosses; follow the player. | ALA `pets.js` |
| World events | Timed/random world occurrences. | ALA `worldevents.js` |
| Reputation | Per-NPC standing tiers with real bonuses. | ALA `reputation.js` |

### 3.6 Endgame & long-tail — Tier 3

| Feature | Notes |
|---|---|
| Prestige | A post-max reset with a permanent edge. Design carefully — it must not invalidate the grind. (ALA `prestige.js` is a starting point.) |
| Achievement diaries | Zone-scoped task lists with unlockable conveniences. |
| Rare drop chases | Long-odds cosmetic/utility items that define a veteran account. |
| Leaderboards | Hiscores by skill and total level. **Async multiplayer** — no live server pressure. See §8. |
| Seasonal / league modes | A fresh account with modified rules for a fixed period. |

### 3.7 CUT — recorded so it is not re-added by accident

Removed by owner decision on **2026-09-09**. These exist, built and tested, in
`Arcanum-Academy` and `arcane-legends-academy`. They are **not** to be carried into the new
game:

- Schools of magic (Fire/Ice/Storm/Myth/Life/Death/Balance; Resonance/Verdance/Ember/Cipher)
- Spell cards, the card catalogue (47 cards), card effects vocabulary
- Card grading, graded slabs, serial minting, foil/holo/prismatic printings, first editions
- Deckbuilding (20-card decks, 3-copy limit) and saved deck slots
- Card-based duels, duel AI difficulties, the duel screen
- The academy curriculum (7 years) and 21-class technique system
- Card packs, card backs, the market/consignment board

**Two ideas from this pile are worth salvaging later, and only later:**
- *Serialised provenance.* The idea that a rare item knows it is the 47th ever made is a
  strong collectible hook and is engine-agnostic. Could apply to rare drops. Tier 4.
- *The technique system.* "A class teaches you a named technique that changes how an existing
  system behaves" is a better progression pattern than flat stat bonuses. Reuse the *shape*
  for skill perks or achievement diaries; drop the academy framing.

### 3.8 Platform & shell — Tier 1

| Feature | Notes | Source |
|---|---|---|
| PWA install | Manifest, `display: standalone`, apple-touch-icon, `apple-mobile-web-app-*` meta. **Functional requirement, not polish** — iOS Safari has no Fullscreen API, so a home-screen launch is the only way to get a chrome-less game. | Oakenfall (complete and correct) |
| Service worker | Network-first with cache fallback, root-relative paths so it survives a host move. | Oakenfall `sw.js` |
| Offline play | The client must open and be usable with no network. | Oakenfall |
| Safe-area insets | `env(safe-area-inset-*)` on every fixed-position element. Notch and home indicator. | Oakenfall (`index.html` — the reference implementation) |
| Orientation support | Portrait primary; landscape re-docks panels to the side. | Oakenfall |
| 44px minimum touch targets | Non-negotiable. | Oakenfall |
| Device quality tiering | Low/Medium/High; budgets the actor pool and effects. | Arcanum `core/device.ts` |
| Context-loss recovery | WebGL context loss is routine on mobile; recover, don't crash. | Arcanum `render/renderer.ts` |
| Visibility gating | Stop rendering when the tab is hidden. | Arcanum |
| Accessibility | Reduced motion, text scaling, colour-blind-safe (**never colour as the only carrier of meaning**), seeded from OS preferences. | Arcanum `a11y/preferences.ts` |
| In-game bug report | Posts to a serverless function that files a GitHub issue with diagnostics attached, so players never need a GitHub account. | Oakenfall `netlify/functions/submit-feedback.js` |
| Error ring buffer + diagnostics | `errorLog` + `buildDiagnostics()` attached to every report. | Oakenfall |
| Versioned saves + migrations | Forward-only migration runner; a save from any older version must load. | Arcanum `persistence/local-store.ts`, shared migration runner |

### 3.9 Onboarding — Tier 1

A guided first-session chain where **every step is derived from the save**, so playing out of
order cannot desync it, with a persistent objective bar and a dismiss flag.
Source: ALA `onboarding.js` + `advice.js` (the pattern is right; port the pattern, not the code).

The chain: *arrive → chop a tree → light a fire → cook a fish → mine copper → smelt a bar →
forge a weapon → kill your first monster → bank your loot.*

---

## 4. Technology — the decisions and why

### 4.1 The stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5, strict, with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax` |
| Runtime | Node 22 |
| Client bundler | Vite 6 + `vite-plugin-pwa` |
| Rendering | **three.js, orthographic camera, fixed isometric pitch** (§5) |
| UI | React 18 + Zustand 5 for overlays; the world is canvas |
| Server | Fastify 5 + `ws` 8 |
| Validation | zod |
| Persistence | IndexedDB (client) + Postgres (server, behind a repository interface) |
| Testing | Vitest |
| RNG | Custom xoshiro128\*\* — deterministic, seedable, serialisable |
| Hosting | Netlify (client) + Render free tier (server) |
| 3D authoring | Blender, **headless in CI**, free |
| CI | GitHub Actions |

**Total recurring cost: $0**, until live multiplayer forces a paid server instance (§8).

### 4.2 Why not Unity — settled, do not reopen

Both `isorpg` and `arcane-legends-academy` attempted a Unity migration. Both stalled. The
evidence is in those repositories and it is decisive **for this owner's specific situation**:

1. **Unity's payoff is native mobile, and the App Store is explicitly excluded.** Strip that
   away and what remains is Unity WebGL — Unity's weakest target — competing against a
   hand-written web build on the same device.
2. **The Editor cannot run on a phone, and there is no workaround.** ALA's own migration doc
   states this. isorpg has a `docs/EDITOR_LANE.md` that exists solely for three tasks that
   *require a Mac with the Editor open*, and they have been "next" since August.
3. **iOS Safari limits are brutal for Unity WebGL** (isorpg `HANDOFF.md` §2): single-threaded
   (no Jobs, no Burst), a fixed 256–384 MB heap that iOS kills tabs for exceeding, and a
   download-size retention cliff. isorpg's own target was <40 MB Brotli; its last committed
   build report is **45.85 MB**, already over — and that build came off a Mac
   (`output_path: /private/tmp/...`), not CI.
4. **A build round trip is ~17 minutes** (isorpg CI: 14 s preflight + 15 m 18 s build + 1 m 21 s
   deploy) versus ~2 seconds for a web build. That is a 500× slowdown on the scarcest
   resource this project has: iteration speed.
5. **The C# toolchain disagrees with itself silently.** isorpg confirmed three
   Mono-`mcs`-vs-Roslyn divergences, two with no warning at all — including `20_000` parsing
   as `200000`. Container-verified C# is not the C# Unity ships.
6. **three.js was never the ceiling.** ALA's own engine audit found that its animation
   failures were **bugs, not engine limits** — the models shipped 76- and 95-clip libraries
   the code simply failed to select from. Unity would not have found those bugs.

**Blender is still in the plan** — as a build-time tool driven by Python in GitHub Actions,
free and Mac-free, not as a live MCP connection to a desktop app. See §6.

### 4.3 Why not Canvas 2D

Oakenfall proves Canvas 2D isometric works and is astonishingly cheap (15.3 MB → 395 KB).
It is rejected for this game for one specific reason: **depth sorting**. In Canvas 2D
isometric you hand-write painter's-algorithm sorting, and it breaks on tall objects,
overlapping footprints, diagonal movement and anything that flies. With an orthographic
WebGL camera the z-buffer handles it for free. Given the owner wants a **rotating** camera
(§5), hand-written sort order becomes materially harder still.

### 4.4 Architecture — non-negotiable

```
packages/
  shared/   ids, Result, RNG, tunables, protocol, content catalogs, world data
  sim/      deterministic kernel: tick, nav, locomotion, combat, economy, NPCs
  server/   gateway, sessions, identity, persistence, admin
  client/   three.js renderer, React overlays, input, PWA shell
tools/scripts/check-boundaries.mjs   executable architecture linter — fails CI
```

**Dependency direction, enforced by the linter, not by convention:**

```
shared → (nothing)
sim    → shared
server → shared, sim
client → shared, sim
```

Four rules that carry over from `Arcanum-Academy` and must survive:

- **ADR-0001 — server-authoritative deterministic simulation.** The server owns all outcomes.
  Client and server share `@arcanum/sim` — identical logic, no duplication. The client
  predicts; the server verifies by state-hash comparison; a mismatch triggers a resync, not
  a disconnect. *Keep this even while single-player.* Gutting it to save hosting cost is the
  one change that would be expensive to reverse.
- **ADR-0002 — balance lives in versioned data.** Every tunable number lives in one
  `DEFAULT_TUNABLES` file. Gameplay code never hardcodes a literal. The tunables version is
  recorded in replays.
- **ADR-0003 — architecture boundaries are executable.** `check-boundaries.mjs` is a real
  linter that reads imports and fails CI. It catches **type-only** imports too, because
  `import type` compiles away and would otherwise let a rule leak with no runtime trace.
- **ADR-0005 (new) — content is data, validated at load.** Items, recipes, nodes, monsters,
  drop tables, quests and zones are JSON, compiled to frozen catalogs at import. Bad content
  throws at module load, not mid-harvest. Validators gather every problem and report them
  together with distinct reason codes.

**ESLint rules that must be enforced:** `Math.random` and `Date.now` are banned inside
`packages/sim` (use the injected `Rng` and clock); `consistent-type-imports` everywhere.

---

## 5. Controls & camera — the spec

Owner decision, 2026-09-09: **tap-to-walk, two-finger rotate, pinch to zoom. No virtual
joystick.**

### 5.1 Input contract

| Gesture | Action |
|---|---|
| Tap ground | Walk there (path via nav graph, then a final direct metre) |
| Tap interactable | Walk to its approach point, then perform the verb |
| Tap monster | Walk into range, then engage |
| One-finger drag | Rotate camera yaw (OSRS-style) |
| Two-finger pinch | Zoom (clamped) |
| Two-finger drag | Adjust pitch within a constrained band |
| Long press | Context menu — the OSRS "right-click" equivalent. **Essential**; many actions have more than one verb (Chop / Examine, Attack / Examine / Pickpocket). |
| Double tap | Reserved. Do not assign without a design reason. |

`Arcanum-Academy` already has `InputService` with tap/longpress/drag/pinch recognition and a
`PlayerController` with `moveTo()` and `approach()`. **The joystick (`input/joystick.ts`,
`ui/JoystickPad.tsx`) is deleted, along with the stick-vs-tap arbitration in
`player-controller.step()`.**

### 5.2 The camera, and an honest tradeoff

The owner wants a rotating camera. That is the right call for an OSRS-style game — but note
the cost, because it changes the art budget:

> A **locked** isometric camera is a budget decision: models only ever look right from one
> angle, so backfaces never show and buildings need no backs. A **rotating** camera gives
> that saving up.

**The resolution: free yaw, constrained pitch.** Assets must look correct through 360° of
horizontal rotation, but only within a narrow vertical band (roughly 30–60° above the
horizon). You never see the top of a roof or the underside of anything. That keeps most of
the saving — no detailed roofs, no interiors visible from outside, aggressive LOD on
anything above eye level.

**This decision has one important consequence for art:** it pushes strongly toward **low-poly
3D meshes over pre-rendered sprites** for anything animated. A sprite sheet under free yaw
needs 8–16 directions × every animation frame × every gear variant, which multiplies out of
control. A rigged low-poly mesh animates once and works from every angle, at any zoom, with
equipment attached to bones. See §6.

**Camera spec:**

| Property | Value |
|---|---|
| Projection | Orthographic |
| Yaw | Free, 360°, smoothed |
| Pitch | Clamped to a band (start ~30–60°, tune on device) |
| Zoom | Clamped ortho frustum size, pinch-driven |
| Follow | Exponential smoothing toward the player |
| Framing | A `frame()` call for scripted shots (boss entry, quest beats) |

`camera-rig.ts` currently uses a `PerspectiveCamera` with yaw/pitch orbit. Converting it to
orthographic and re-tuning the band is a contained change to one file.

---

## 6. Art direction & the asset pipeline

### 6.1 Direction

**Dark old-school-MMORPG.** Oakenfall's palette is the reference and it is already good:
earth-tinted, desaturated, readable in sunlight on a phone. Every new asset is
**colour-graded** (darkened, earth-tinted) before it ships, matching the existing GRADE
conventions.

Style rules (inherited from ALA's `BLENDERTODO.md` §0, which are correct and should be
carried over verbatim into the new repo):

- 1 Blender unit = 1 metre; metric; scale 1.0. Apply all transforms before export.
- Flat-shaded, low-poly. Hard edges. Chunky, readable silhouettes.
- Detail below ~5 cm is invisible at play distance — delete it.
- No bevels below 2 cm. No subdivision surface. No microdetail geometry.
- Colour from flat materials or a small texture atlas — never per-object 2K maps.
- **Never bake lighting or AO into textures.** The game lights the scene.

### 6.2 Sources

CC0 and free-licence only: **Kenney** (blocks, tiles, UI), **KayKit** (Medieval Hexagon,
Dungeon Remastered, Furniture Bits), **Quaternius** (nature, characters, monsters).
Every asset gets a licence entry in `CREDITS.md` before it is committed. `itch.io` packs are
session-protected — the owner must attach them manually.

### 6.3 The pipeline

```
Blender (local or headless-in-CI)
   ↓  export GLB, Z-up, origin at base centre
gltf-transform  → draco/meshopt compress, resize textures to ≤512px
   ↓
public/assets/  (local, bundled, service-worker cached)
   ↓
three.js loader, with a procedural fallback behind every consumer
```

**Two hard rules:**

1. **Assets are bundled locally and never fetched from a third-party CDN at runtime.**
   Offline play must always work. (ALA violates this — 13 MB of models on CloudFront. Do not
   copy that.)
2. **Every sprite/model consumer has a procedural fallback.** Sprites are an upgrade layer,
   never a dependency. This is why Oakenfall never shows a missing texture. **Never remove a
   fallback.**

Existing tooling to port: Oakenfall `tools/extract-assets.mjs`, `tools/rewrite-assets.mjs`;
ALA `tools/import-asset.mjs` and `npm run check:models` (loads and renders every shipped
model — an excellent gate).

### 6.4 Blender in CI

`blender -b -P script.py` runs headless in GitHub Actions on the free tier: no licence, no
Mac, no GPU needed for the operations that matter (import, decimate, re-origin, re-material,
export, batch-render sprite sheets for props). This is how the owner gets Blender's value
from a phone. Write these as committed Python scripts, never as manual Editor steps.

### 6.5 Asset budget

| Budget | Value |
|---|---|
| Initial download | **< 5 MB** (Oakenfall ships ~395 KB of code + assets on demand) |
| Total loaded assets at any moment | < 150 MB (leaves headroom under iOS's 256–384 MB) |
| Per-model | < 500 KB after compression; anything above needs a written justification |
| Texture | ≤ 512 px, atlased where possible |

---

## 7. Ironman — the economy design

Owner decision: **Ironman is the default and only mode at launch.** Everything is
self-gathered and self-made. No player trading.

### 7.1 What this simplifies (and it is a lot)

- **No player economy to balance.** No inflation, no market manipulation, no bot-driven
  price collapse — the failure mode that consumes most of an MMO economy designer's life.
- **No RMT surface.** Nothing to sell, so nothing to farm and sell.
- **No trade escrow needed at launch.** (`Arcanum-Academy` has a full four-step escrowed
  trading system with an append-only ledger — keep the code, disable the feature.)
- **Every drop rate is a pure content-pacing decision**, judged against one player's time
  rather than against a market.
- **Single-player-first stops being a compromise** and becomes the correct design.

### 7.2 What this demands

- **Every item must be obtainable solo.** No exceptions. A boss that needs a group, dropping
  a required item, is a design bug. Audit this on every content addition.
- **Drop rates must respect the player's time.** Ironman means a bad rate is not routed
  around by buying the item — it is simply a wall.
- **Shops sell utilities, never progression.** Basic tools, food, ammunition, teleport
  charges. Never gear that competes with what you can make.
- **Sinks matter more than sources.** Tool repair (§3.2), consumables, construction
  materials. Currency exists to be spent, not accumulated.

### 7.3 If trading ever returns

It becomes a **mode**, not a change to the default. An account picks Ironman or Standard at
creation and can drop from Ironman to Standard but never the reverse. The escrow, ledger and
confirmation machinery already exists in `Arcanum-Academy` — see §11.1.

---

## 8. Multiplayer — the phased plan

The owner is not ready for multiplayer, but wants the path preserved. **This is the good
news: it is already built.** `Arcanum-Academy` has presence with radius-based interest
management and a hard cap, four-step escrowed trading inside a single transaction with an
append-only ledger, a matchmaking queue whose rating tolerance widens with wait time, and
duels on shared server state with Elo settled in one transaction.

**Two things gate turning any of it on, and neither is code:**

### 8.1 🔴 Account recovery does not exist — this is the real blocker

An account currently lives **entirely in one browser's IndexedDB**. Clear site data, switch
device, or lose the phone, and it is gone permanently. The server holds only a SHA-256 hash
of the bearer token and cannot identify who a lost token belonged to. There is no recovery,
no migration, no support path.

Acceptable for a test build. **Unacceptable the moment an account holds anything of value** —
and in an Ironman game, where every item represents hours of grinding, that threshold arrives
almost immediately.

Options as of 2026-09:
- **Supabase Auth** — free tier covers email/password, magic links and OAuth. Closest to a
  complete answer; would replace `IdentityService` rather than sit beside it. **Recommended.**
- **Resend** — ~3,000 emails/month free, if we keep our own flow and only need delivery.
- **GitHub OAuth** — free and immediate, but requires every player to have a GitHub account.
  Fine for a closed test, wrong for a consumer game.
- ~~Netlify Identity~~ — deprecated for new projects. Not a candidate.

The shape of the work: bind an address to a player, verify it, let a verified address mint a
fresh token that invalidates the old one. The token scheme already supports this — issuing is
a single call — so this is a **provider decision first and a small amount of code second**.

### 8.2 Hosting cost

Render's free tier sleeps after ~15 idle minutes and cold-starts in 30–60 seconds. Fine for a
demo link; unusable the moment two people try to play together. This is the project's first
real bill.

### 8.3 The order

| Phase | What | Cost | Gate |
|---|---|---|---|
| **M-0 (now)** | Single-player. Server runs locally in dev, on free Render in prod. Server-authoritative architecture kept intact. | $0 | — |
| **M-1** | **Async multiplayer.** Hiscores/leaderboards, other players' accounts visible as read-only profiles, collection-log comparison. No live server pressure — a static read and one function. | ~$0 | Account recovery |
| **M-2** | **Shared world presence.** See other players walking around; no interaction beyond emotes. | Paid instance | M-1 |
| **M-3** | **Grouping.** Co-op dungeon runs, shared boss fights. | Paid instance | M-2 |
| **M-4** | **Standard (non-Ironman) mode + trading.** Enable the escrow that already exists. | Paid instance | M-3 + a considered economy design |

**Never** enable trading while Ironman is the only mode. It would invalidate every account.

---

## 9. Admin panel & operations

Owner request: the ability to see player accounts, manage them, grant/modify items, and
generally administer the game. **Yes, this is entirely feasible**, and the server already has
most of the machinery. Here is the design.

### 9.1 What it must do

| Capability | Notes |
|---|---|
| List & search players | By id, by creation date, by last-seen, by total level. Paginated. |
| Inspect a save | Full read-only view: inventory, bank, skills, quests, achievements, position, playtime. |
| Grant / remove items | Choose from the **validated item catalogue**, with a quantity cap. Never free-text. |
| Set skill XP | Set or add XP; level is always derived, never set directly. |
| Adjust currency | Same validation path. |
| Flag / ban / unban | With a reason string, surfaced to the player on next login. |
| Restore a save | From a point-in-time snapshot (§9.4). |
| Reset a player | Full wipe, with confirmation, for support requests. |
| View the audit log | Every admin action, immutable. |
| Server health | Sessions connected, tick rate, error rate. `/healthz` `/readyz` `/metrics` already exist. |

### 9.2 The non-negotiable safety rules

These are what separate a useful admin panel from a save-corruption machine:

1. **Every mutation goes through the same domain functions the game uses**
   (`PlayerService.mutate` under optimistic concurrency), never raw SQL. If granting an item
   through the admin panel can produce a state the game cannot produce, you will eventually
   hand a player an unloadable save.
2. **Every item id, recipe id and quantity is validated against the live content catalogues.**
   The panel offers a picker, never a text box.
3. **Append-only audit log.** Who, when, target player, action, before-value, after-value.
   `Arcanum-Academy`'s trading ledger is exactly this pattern — reuse it. A dispute or a
   mistake is unanswerable without it.
4. **An `adminTouched` flag on the account.** In an Ironman game, a granted item is a
   violation of the game's core promise. Any account that has received admin intervention is
   flagged, and that flag excludes it from leaderboards. This protects the integrity of
   §7 without preventing you from doing support.
5. **Admin auth is separate from player auth.** A distinct credential (an env-var-held admin
   token or a Supabase role once §8.1 lands), never an elevated player bearer token. Player
   tokens are stored as hashes precisely so a database leak yields nothing; do not undermine
   that by making one of them a master key.
6. **The admin client is a separate bundle**, served on a separate route, and never imported
   by the game client. Admin code must not ship to players.
7. **Rate-limit and log every admin request** the same way the gateway rate-limits players.

### 9.3 Where it lives

```
packages/server/src/admin/
  routes.ts        Fastify routes under /admin/*, behind admin auth middleware
  auth.ts          admin credential verification, constant-time comparison
  audit.ts         append-only audit log writer + reader
  operations.ts    grant/revoke/setXp/ban/restore — all via PlayerService
packages/admin/    a separate tiny Vite app; NOT part of the game bundle
```

The existing pieces you build on: `PlayerService` (load/mutate/save with bounded retry under
optimistic concurrency), `PlayerRepository` interface with in-memory and Postgres adapters,
`IdentityService` with hashed tokens and constant-time comparison, the Fastify health
endpoints, and the gateway's rate limiter.

### 9.4 Backups — do this before the admin panel, not after

An admin panel that can modify accounts without a way to undo it is a liability. Before
shipping §9.1, add **point-in-time save snapshots**: on every save, retain the previous N
versions (or a daily snapshot) in a separate table. Cheap, and it converts "I broke someone's
account" from a catastrophe into a click. This also covers save-corruption bugs, which are the
single worst class of bug this game can have.

### 9.5 Also worth having

- **Analytics.** ALA's `analytics.js` + a `/api/dashboard` endpoint is a good, cheap pattern:
  session start/end, zone visits, low-FPS samples, uncaught errors, stuck-movement events.
  Batch and POST every ~4 s and on page-hide via `sendBeacon`. **Keep it first-party** — no
  third-party trackers, no personal data.
- **The in-game report button** (Oakenfall) — a serverless function files the GitHub issue
  server-side with a repo-scoped token, so players never need a GitHub account. Diagnostics
  attach automatically. This is the best feedback loop in any of the four repos; port it.
- **Promo/unlock codes.** Oakenfall signs codes with an ECDSA P-256 private key held only in
  the Netlify environment, and the game verifies them **offline** against an embedded public
  key. Useful for beta access, gifts and testing, with no network requirement and no
  forgeable codes even though the source is public.

---

## 10. Repository strategy — the recommendation

You have four repositories, none finished, all fantasy-adjacent. The question is whether to
start fresh, merge, or continue.

### 10.1 The three options

**Option A — Brand-new fifth repository.** Clean and tempting. But you would spend two months
rebuilding things that already exist and pass tests, and you would have four abandoned repos
plus one empty one. The dead period is real, and momentum is a solo dev's scarcest resource.
**Not recommended.**

**Option B — Continue in Oakenfall.** Keeps the live URL, the PWA, the feedback loop, 71
commits of momentum. But Oakenfall's code *is* a colony sim — 7,281 lines of villager state
machines, building placement and morale, in a file under `@ts-nocheck` (typechecking is
switched off). You would delete most of it, fight the rest, and hand your future self a git
history where a colony sim silently becomes an RPG. **Not recommended.**

**Option C — `Arcanum-Academy` becomes the spine; the other three become quarries.** ✅

### 10.2 Why Arcanum-Academy is the spine

Not because of its content — much of that is now cut (§3.7) — but because of its
**architecture and its server**. It is the only one of the four that has:

- A properly layered monorepo with an **executable** boundary linter
- A deterministic, server-authoritative simulation kernel with snapshot/restore and state
  hashing
- A real gateway: handshake, heartbeat, session resume, rate limiting, sweep
- Identity done correctly (32-byte bearer tokens, only the SHA-256 hash stored, constant-time
  comparison, unknown tokens refused rather than silently minted into new accounts)
- A persistence port with in-memory and Postgres adapters, optimistic concurrency enforced by
  a conditional UPDATE
- Tunables-as-data, ADRs, determinism ESLint rules, versioned save migrations
- A deployed client and server, with the environment-variable traps already documented

For a project the owner intends to keep adding to for years, that foundation is worth more
than any amount of feature code. And critically: **the loop he chose is already wired there** —
`gathering.start/collect/stop`, `crafting.craft`, walk-to-interactable with a contextual
verb, four zones, inventory, skills.

### 10.3 The plan

1. **Rename the project** in `Arcanum-Academy` (see §14 Q1 — the name is not yet chosen).
   Keep the repository, keep the git history, keep the deployment.
2. **Delete the cut features** (§3.7): `sim/combat/` (card duel), `cards/`, deck builder,
   scribing, grading, serial minter, `content/data/cards.json`, `schools.json`,
   `DuelScreen.tsx`, `CollectionPanel.tsx`. This is a large, satisfying deletion and it
   should be one commit with a clear message.
3. **Disable, do not delete, the multiplayer layer.** Trading, matchmaking, PvP and presence
   move behind a feature flag. They are correct, tested, and expensive to rewrite (§8).
4. **Port isorpg's TypeScript systems** into `packages/sim` — see §11.2. This is the single
   highest-value transfer in the whole plan: OSRS combat maths, 12 skills, XP tables, drop
   tables, quests, clues, dungeons, farming, shops, all in TypeScript, all already tested.
5. **Port Oakenfall's shell and pipeline** — see §11.3.
6. **Rework the camera and delete the joystick** (§5).
7. **Do the art pass on one zone** before building anything else (§13, Gate 1).

### 10.4 The rule that keeps this from becoming a mess

> **Port data and assets. Never port code you have not read and understood.**

ALA's modules carry a 633 MB heap leak, an async chunk-load race, and a bug where 19
creatures looped their own death animation because the code played `animations[0]`. Copying
those files copies those bugs. Take the **JSON, the tables, the design, and the lessons.**

The other three repositories are **frozen and read-only from the moment the spine work
starts.** Oakenfall keeps running at its live URL — the owner likes that game and there is no
reason to take it down.

---

## 11. The quarry map — what exists, where, and what to take

### 11.1 Arcanum-Academy — THE SPINE (49 commits, 25.4k LOC, 129 TS files)

**Keep and build on:** everything in §10.2, plus `sim/nav.ts` (A*), `sim/locomotion.ts`,
`sim/schedule.ts` + `sim/npc.ts` (NPC schedules, deterministic barks), `sim/economy/*`
(inventory, gathering, crafting, skills), `world/graph.ts` (`buildNavGraph` with exhaustive
validation), `content/catalogs.ts` (validator pattern), `client/world/actor-pool.ts`
(instanced crowd, 2 draw calls), `client/core/device.ts` (quality tiering),
`client/render/renderer.ts` (context-loss recovery), `a11y/preferences.ts`,
`persistence/local-store.ts` (IndexedDB + migrations), the whole `server/` tree.

**Delete:** §3.7's list.

**Disable behind a flag:** `domain/trading.ts`, `domain/matchmaking.ts`, `domain/pvp.ts`,
`domain/presence.ts`, `net/handlers/social.ts`.

**Known deferrals to be aware of:**
- **Tools are modelled but never granted.** `ToolProperties`, durability spend and reduced
  worn-tool yield all work and are tested; nothing hands the player a tool, because
  `repairCost` is denominated in a currency that did not exist yet. Closing this is Tier 1
  now.
- **Crafting has no duration.** `craftDurationMs` is authored and validated but a craft
  resolves immediately.
- **No client-side prediction yet.** Every number shown is server-confirmed. The rules to
  predict with already live in `sim`, so adding it is a change in one file.

### 11.2 isorpg / Alderfell — THE GAME-SYSTEMS QUARRY (62 commits, 174 MB)

**This is now the most valuable donor**, because the game is OSRS-shaped and so is this repo.

**Take, as TypeScript, from `src/` — the original web build, which still passes 321 tests:**

```
src/data/      Combat.ts  Skills.ts  XPTable.ts  Items.ts  Recipes.ts
               Quests.ts  Clues.ts   Farming.ts  Npcs.ts   Shop.ts
               Buildings.ts  Achievements.ts          (~5.5k LOC of data + systems)
src/systems/   CombatSystem  SkillSystem  CraftingSystem  QuestSystem
               ClueSystem    DungeonSystem  FarmSystem   ShopSystem
               NpcSystem     MovementSystem  MapSystem   MetaSystem
```

Note the C# port in `unity/Assets/Isoperia/Core/` is **not** wasted even though Unity is
cut: it was written to be engine-agnostic (`noEngineReferences: true`) and validated
roll-for-roll against the TypeScript, and its 378 assertions plus the parity fixtures are an
excellent **specification** of correct behaviour. Read the C# tests when porting the TS.

**Also take:** `docs/` — the iOS constraint table in `HANDOFF.md` §2, `ASSET_ADMISSION.md`,
`VISUAL_DIRECTION.md`, `WORLD_LAYOUT.md`. And the verification culture (§12).

**Leave:** the entire `unity/` tree, the FBX assets, Git LFS, the GameCI workflows.

### 11.3 Oakenfall — THE SHELL & ART QUARRY (71 commits, v1.71.0, live)

**Take:**
- The **PWA shell**: `manifest.webmanifest`, `sw.js`, the `apple-*` meta tags, and above all
  the `env(safe-area-inset-*)` usage throughout `index.html` — that file is the reference
  implementation for a game that behaves correctly on an iPhone home screen.
- The **landscape re-dock** pattern (bottom sheets become side sheets).
- The **asset pipeline**: `tools/extract-assets.mjs`, `tools/rewrite-assets.mjs`, and the
  GRADE colour-grading convention.
- The **sprite-with-procedural-fallback pattern**. Protect this above all else.
- The **palette** and dark-medieval art direction.
- The **feedback loop**: `netlify/functions/submit-feedback.js`, `errorLog` ring buffer,
  `buildDiagnostics()`, GAME_VERSION + CHANGELOG discipline (the site build fails if they
  disagree — keep that gate).
- The **offline-verified unlock codes** (ECDSA P-256, public key embedded).
- **Weather and seasons** design: rain pooling in low ground, snow accumulating unevenly,
  rivers freezing.
- The **verification scripts**: `npm run smoke` boots the real game in Chromium at
  phone/landscape/desktop and asserts the world renders, assets load, the HUD does not
  collide, and no console/request errors occur. `tools/shots.mjs` screenshots both
  orientations. Port both — they catch things assertions cannot.

**Leave:** the colony-sim game logic in `main.ts` (until the player-hold feature, §3.5, when
`BUILD_DEFS` and the villager AI become relevant again at a much smaller scale), and the
`@ts-nocheck`.

**Keep the repo live.** It is a finished, playable game and there is no reason to take it down.

### 11.4 arcane-legends-academy — THE CONTENT & LESSONS QUARRY (50 commits, 113 MB)

Most of this repo was the card game, which is cut. What survives:

**Take:**
- **Content tables that are not card-related**: `items.js` (materials, equipment, recipes),
  `nodes.js` (gathering node table), `structures.js` (building/NPC placement + collision
  shapes), `zonequests.js` (quest chains), `dungeons.js` (room layouts), `world/zones.json`
  (6 zones with terrain params, spawns, exits, scatter). Convert to validated JSON.
- **The onboarding pattern** (`onboarding.js`, `advice.js`) — every step derived from the
  save, so out-of-order play cannot desync it.
- **The derived-state rule**: collection value, achievement progress and completion stats are
  computed from the save on every read rather than tracked separately, so they can never
  drift. Apply this everywhere.
- **`BLENDERTODO.md`** — the modelling brief format is excellent and its §0 style rules
  should be carried over verbatim.
- **`docs/MISTAKES.md`** — a running log of mistakes and the rule extracted from each. Start
  this file in the new repo on day one.
- **The analytics pattern** (§9.5).
- Feature *designs* worth reusing: `pets.js`, `cooking.js`, `seasons.js`, `weather.js`,
  `worldevents.js`, `achievements.js`, `reputation.js`, `prestige.js`, `collectibles.js`.

**Leave:** all card/school/grading/deck code, `battle3d.js`, `logic.js`, the vendored
three.js r128, the CDN-hosted models, and the unverified `unity/` C# draft (its own README
says it has never been compiled or run).

---

## 12. Hard rules and traps — read before writing code

Every one of these was paid for in one of the four repositories.

### Determinism
- **Draw order is part of the contract.** Getting it wrong leaves every formula correct and
  still produces a different game from the same seed. Document draw order in a doc comment
  and assert the **draw count** in tests, not just the outcome. Examples already pinned: a
  guaranteed special skips the accuracy draw; a tertiary drop that misses takes no quantity
  draw; an affix roll takes one value on failure and two on success.
- **Never call `Math.random()` or `Date.now()` in `packages/sim`.** Inject `Rng` and the
  clock. ESLint enforces this.
- **Magnitudes must be integers** where they are hashed — fractions do not hash identically
  across platforms.
- **A session is a seed and a tick count, never a list of rolled results.**

### Testing
- **A test that passes is not evidence. A test that fails when you break the code is.**
  Mutation-test new systems: deliberately break the production code and confirm the suite
  goes red. isorpg found four worthless tests this way, and on `DungeonSystem` 2 of 11
  mutants initially survived.
- **Never use `Assert.Ignore`, `.skip`, or `.todo` to get green.** Caught and reverted twice
  already.
- **Verify against a running build, not against reasoning.** The severe findings in ALA — a
  633 MB heap leak, an async chunk race, the death-animation loop — were all found by
  *measuring*. Screenshot anything visual; the automated checks have passed while the UI
  looked wrong.

### Content & data
- **Content is validated at load, and validators report every problem together** with
  distinct reason codes, not the first failure.
- **Never put a timestamp in generated output.** It makes CI red by construction, because the
  committed file can never match a regenerated one. Deriving the date from `git log` also
  fails — `actions/checkout` does a shallow clone.
- **Parsing a save must be total.** Anything unrecognised becomes a default. Locking a player
  out over one strange field is worse than losing a regrowth timer.
- **Derived state is derived, never stored.** Level from XP. Completion from the save.

### Rendering & mobile
- **Never set `canvas.width/height` when unchanged** — it causes a resize feedback loop in
  iframes.
- **Keep `drawImage` in try/catch in hot paths.** iOS Safari throws spurious
  `RangeError: Maximum call stack size exceeded` from `drawImage` under memory pressure.
- **Never multiply arc/ellipse radii by signed direction values** — mirror with
  `ctx.scale(-1, 1)`.
- **Per-frame gradient allocation is expensive.** Cache, or use flat fills.
- **Sprite-sheet frames must be trimmed with a UNION bbox across frames**, or animations
  jitter. Fixed once already — do not reintroduce.
- **Select animation clips by role, never by index.** glTF stores clips in authoring order;
  in Quaternius packs clip 0 is `Death`. Nineteen creatures once looped their own death
  animation because of `animations[0]`. Naming conventions genuinely disagree across packs
  (`Idle`, `MonsterArmature|Idle`, `Armature|Idle|baselayer`, and `HitRecieve`, misspelled
  in the source).
- **Audit what a model actually contains before authoring new ones.** Rich rigs have shipped
  unused — `npc_mage.glb` has 76 clips, `enemy_skeleton.glb` has 95.
- **Colour management is manual in older three.js.** Set output encoding and tone mapping, and
  run hand-authored hex colours through `convertSRGBToLinear()`, or everything renders ~2
  stops dark.
- **Asset coherence is a texture problem, not a polycount problem.** KayKit-style assets share
  one material and differentiate via a small colour-swatch atlas; a blanket re-texture
  destroys that.

### Deployment
- **`VITE_SERVER_URL` is read at build time** — changing it requires a rebuild, not just a
  save. It must be `wss://`, never `ws://`: an HTTPS page cannot open an insecure WebSocket.
- **`ALLOWED_ORIGINS` must exactly match the client origin.** A wrong value silently refuses
  every browser connection in production and looks like a network fault.
- **`DATABASE_URL` unset means player progress lives in memory** and is destroyed on every
  restart — roughly every fifteen idle minutes on a free instance. The server refuses to
  start if the variable is set but the database is unreachable, rather than looking healthy
  while losing every write. Keep that behaviour.

---

## 13. The roadmap

Milestones gate on **demonstrable quality**, not feature counts. Do not start the next gate
until the current one is evidenced with a screenshot or a passing verification run committed
to the repo.

| Gate | What | Passes when |
|---|---|---|
| **G0 — Foundation reset** | Rename. Delete the cut features. Flag off multiplayer. Camera → orthographic, joystick deleted, tap-to-walk + rotate + pinch. | `npm run verify` green; the game boots and you can walk around by tapping. |
| **G1 — The look** ⚠️ | Port Oakenfall's palette, asset pipeline and PWA shell. Re-skin **one** zone with real assets and fallbacks. | **A screenshot from the owner's actual iPhone, launched from the home screen, that looks good.** Nothing else proceeds until this passes. This is the gate isorpg identified as the most important in its plan, and the one previous projects failed. |
| **G2 — The loop** | Port isorpg's skills, XP, nodes, recipes. Grant tools. Bank. Walk → gather → craft → equip, all in the world. | A stranger plays 10 minutes and levels a skill without guidance. |
| **G3 — Combat** | Port the OSRS combat maths, attack styles, drop tables, food, death. | Killing one monster is satisfying twenty times in a row. |
| **G4 — A world** | 3–4 zones, hand-composed, with travel, landmarks, day/night and weather. | You can walk for five minutes and every stop is worth a screenshot. |
| **G5 — Content** | Quests, dungeons, clues, achievements, collection log, onboarding chain. | A stranger plays 45 minutes without guidance. |
| **G6 — Operations** | Save snapshots, then the admin panel, then analytics and the in-game report button. | You can find, inspect and safely repair any account, and undo it. |
| **G7 — Account recovery** | Supabase Auth (or chosen provider). Email-bound accounts, token rotation. | An account survives clearing site data. |
| **G8 — Async multiplayer** | Hiscores, profiles, collection comparison. | Two accounts can see each other's progress. |
| **G9+** | Live presence, grouping, standard mode + trading. | Per §8. |

---

## 14. Open questions — decisions not yet made

**Q1 — The game's name.** Not chosen. "Arcanum Academy", "Alderfell", "Isoperia" and
"Oakenfall" all belong to superseded or frozen projects. The repo, the PWA manifest, the
package scope (`@arcanum/*`) and the deployment all need it. **This blocks G0.**

**Q2 — The setting.** With the magic academy cut, what is the world? "Washed up on the coast
of a fallen realm" (Alderfell's premise) is strong and fits self-reliance. Oakenfall's
dark-medieval tone is the art direction. Reconciling them is a one-paragraph decision that
shapes every zone, NPC and item name — worth making deliberately.

**Q3 — Magic, post-schools.** The combat triangle wants a third style. Does magic survive in
a non-school form (staves, runes, a single Magic skill), or is the triangle
Melee/Ranged/something else? OSRS's answer is Magic; the question is only how it is themed.

**Q4 — Grading/serials.** §3.7 flags serialised provenance as salvageable. Does a rare drop
knowing it is the 47th ever made add anything to an Ironman game where nobody trades? Lean
no for now; revisit if standard mode ever ships.

**Q5 — The differentiator.** The most important open question, and the one four repositories
have not answered. From ALA's own migration doc: *"the game is a broad, well-tested systems
sandbox without a sharp identity. Breadth is not the problem. The missing piece is a reason
to play this one."* Candidate answers: the player-owned hold as a real production base
(§3.5); Ironman-by-default as an identity rather than a mode; or something not yet named.
**Do not let this block G0–G3** — the answer usually arrives from playing, not planning — but
do not lose the question either.

**Q6 — Offline accrual vs "earned, not idled".** Pillar 1 says everything is earned; §3.2
carries 25%/8 hr offline accrual over from Arcanum. isorpg's pillars explicitly rejected
offline progression. These conflict. Decide before G2.

---

## 15. Working agreements

- **No TODOs, placeholder logic, fake implementations, stub methods, or pseudocode.** If one
  system depends on another, build both or stop and explain the missing dependency.
- **Run the full verification before declaring any task complete.**
- **Before each meaningful coding step:** state the objective, the systems involved, the
  dependencies, and the approach — then implement.
- **If an improvement only affects engineering quality, proceed. If it changes gameplay
  balance or fairness, explain the tradeoff and ask first.**
- **Outline architecture before large code dumps.** The owner prefers reviewing a plan before
  a big batch of changes, and prefers fewer, larger tool calls.
- **Keep `docs/MISTAKES.md` current.** Every time something goes wrong, write down the rule
  that would have caught it.
- **Update this document in the same commit that makes it wrong.**

---

*Compiled from a complete read of `OfficialSyntaxx/Arcanum-Academy`, `OfficialSyntaxx/isorpg`,
`OfficialSyntaxx/oakenfall` and `OfficialSyntaxx/arcane-legends-academy` — source, docs, git
history, build reports and asset trees. Test counts cited from each repository's own
documentation; the suites were not executed during compilation.*
