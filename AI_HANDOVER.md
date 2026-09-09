# ALDERFELL — AI HANDOVER

### The full vision, the full feature set, and how to build it

**Written:** 2026-09-09 · **Author:** Claude Code, from a full read of all four repositories
**Owner:** Syntaxx (`OfficialSyntaxx`) · **Status:** canonical. This document supersedes the
project docs in the other three repositories.

> **The game is called Alderfell.** The name is inherited from `isorpg`, whose project is
> being folded into this one. Package scope: `@alderfell/*`.

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

**Alderfell** is a **mobile-first, browser-based fantasy RPG built on OSRS's design
philosophy**: you wash up with nothing on the coast of a fallen realm, and everything you own
you gathered, made, or killed something for. Deep skill progression, tick-based combat you
read rather than react to, a hand-built world you walk through, and a grind that is the point
rather than an obstacle. It installs to an iPhone home screen as a PWA — **no App Store,
ever**. Single-player at launch, architected so multiplayer is a milestone rather than a
rewrite.

### 1.1.1 The premise

> *You wash up on the coast of a fallen realm with nothing, and you climb — through its
> forests, its ruins and its guilds — until the realm knows your name.*

A kingdom that has already collapsed. Its roads are overgrown, its mines abandoned, its
guilds reduced to a handful of survivors who still remember the craft. You arrive with
nothing and no claim on anyone.

**This premise is load-bearing, not flavour.** It is the diegetic reason for Ironman (§7):
there is no functioning economy to buy from, no one to trade with, and nothing left to
inherit. Every design question of the form *"why can't the player just buy this?"* is
answered by the setting rather than by a rule.

Tone: **dark medieval**, per Oakenfall's art direction (§6.1) — weathered, earth-toned,
overgrown. Not grimdark, not whimsical. A world that used to work.

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
- **Not an idle game.** There is no offline progression at all (D5). Nothing advances while
  you are closed except world timers that are not progression — crops, regrowth, repairs.
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
| **A check-in** | 2–5 min | Bank a load, check crops, run one gathering trip, log off. Short sessions must still bank real progress — with no offline accrual this is the session most at risk of feeling pointless, so protect it. |
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

> **Scope: build one zone properly, with the graph designed for five.** Owner decision,
> 2026-09-09. The launch region is **the Shorelands** — where you wash up. It must contain
> something for all 14 skills, one dungeon and one boss, so the full loop is exercised in one
> place. But the zone graph, the exit stubs and the content schema are authored for the whole
> five-region arc from day one (Shorelands, Hearth's Landing, Thornwood, Kingsmoor Ruins,
> Coldreach Pass), so adding a region is content work rather than an architectural change.
>
> This is the shape that fits a long-running project: one region good enough to ship, then
> expand forever. It also means **G1 — the art gate — only has to be passed once** before
> there is a real game, instead of five times before there is anything.



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

**The skill list (14 to start, extensible):**

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
| Runecrafting | artisan | Essence → runes (feeds Magic) |
| Attack | combat | Melee accuracy |
| Strength | combat | Melee max hit |
| Defence | combat | Damage avoidance |
| Hitpoints | combat | Health pool |
| Magic | combat | The third leg of the triangle — see §3.4.3 |

Extensible later: Herblore/Alchemy, Fletching, Ranged as its own skill, Hunter, Thieving,
Slayer. **Do not add a skill until there is a full content chain for it** — a skill with
three levels of content is worse than no skill.

| Feature | Notes | Source |
|---|---|---|
| XP curve & levels | Level derived from cumulative XP, never stored beside it. | Arcanum `sim/economy/skills.ts`; isorpg `data/XPTable.ts` |
| Resource nodes | Per-node level req, XP, yield table, depletion, regrowth timers. | Arcanum `content/data/nodes.json`; isorpg `data/Skills.ts` `ResourceDrop` |
| Seeded harvest resolution | A session is a **seed + tick count**, never rolled results, so it replays identically. | Arcanum `sim/economy/gathering.ts` |
| Rare finds | A small chance of a valuable variant per gather. | ALA "Pristine" mechanic |
| Tools & durability | Better tools = faster/better yield. Durability is a **currency sink**: a broken tool never interrupts a session, it reduces the *next* one until repaired. | Arcanum (modelled, not yet granted — see §11.1) |
| Inventory / bag | **30 slots.** Stack + slot arithmetic. Top up partial stacks first; drain smallest-first; ties break on slot index. | Arcanum `sim/economy/inventory.ts` |
| Equipment screen | Worn gear lives on a **separate equipment screen and never occupies bag slots** (OSRS's arrangement). Slots: head, cape, neck, ammo, weapon, body, shield, legs, hands, feet, ring. | — |
| Bank | Deposit/withdraw, tabs, search. **Not yet built anywhere.** | — |

> **Bag size is 30 slots, and it is a design constraint rather than a number.** A tight bag is
> what turns a gathering run into a decision — food or ore, one more rock or bank now. It is a
> large part of why OSRS skilling reads as a game rather than a spreadsheet. `bagSlots` lives
> in tunables, but raising it to remove friction is changing the game, not tuning it.

> **No offline progression.** Owner decision, 2026-09-09. Pillar 1 wins: progress comes from
> going somewhere and doing something. `Arcanum-Academy`'s offline-accrual code
> (`offlineAccrualCapMs`, `gathering.claimOffline`, the interval-stretching logic) is
> **deleted, not disabled** — a dormant progression path invites re-enabling it by accident.
> Timers that advance in real time and are *not* progression — farming crop growth, tool
> repair, node regrowth — are fine and stay.

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
| Tick loop | **600 ms tick** — the simulation resolves on it. Presentation does not: see §3.4.1. | isorpg `TickRunner` |
| Accuracy & max-hit rolls | The OSRS formula shape: attack roll vs defence roll, then a damage roll. | isorpg `CombatSystem.ts` (TS) / `Combat.cs` (C#) — **fully ported and parity-tested both ways** |
| Three attack styles | Accurate (+accuracy, trains Attack) / Aggressive (+max hit, trains Strength) / Defensive (+defence, trains Defence). Constant Hitpoints trickle. | isorpg `data/Combat.ts` `ATTACK_STYLES` |
| Combat triangle | Melee / Ranged / Magic. See §3.4.3. | — |
| Resolve (special resource) | A limited buff resource spent for a short combat edge, restored by resting at a campfire. Gives food a rival for bag space. | isorpg `data/Combat.ts` `BuffId` |
| Weapon specials | Six defined. A guaranteed special **skips the accuracy draw** — draw order is part of the contract (§12). | isorpg |
| Monster affixes | Three defined; an affix roll takes one value on failure and two on success. | isorpg |
| Weighted drop tables | Per-monster, with tertiary rares. A tertiary that misses takes no quantity draw. | isorpg `data/Combat.ts` |
| Food & healing | Eat to heal, costs a tick. | isorpg |
| Death & penalty | OSRS-style: keep the 3 most valuable items, everything else goes to a gravestone at the death site. **No expiry timer for now.** See §3.4.2. | isorpg GDD |
| Boss encounters | Enrage phases, slam attacks, multi-phase behaviour. | isorpg; ALA `archetypes.js` (design) |
| Aggression / safe zones | Which monsters attack on sight, and where they can't. | — |

#### 3.4.1 Combat feel — a 600 ms tick the player never feels

Owner decision, 2026-09-09: **keep the true OSRS 600 ms tick, and make it feel fast through
presentation.**

The tick is a *simulation* property. It exists so combat is deterministic, replayable,
verifiable against the server, and fair over a network later. It is not a statement about how
responsive the game should look.

**The rule: the simulation resolves on the tick; the presentation responds to input
immediately.**

| The moment | What happens |
|---|---|
| Player taps a monster | The character starts moving and the target highlights **on that frame**, not on the next tick. |
| Player queues an attack | The UI acknowledges instantly — the action indicator lights up. |
| The tick resolves | Damage is computed authoritatively. |
| Damage lands | Hitsplat, sound, flinch animation and health-bar movement fire immediately on resolution, and are *animated* across the following ticks rather than snapping. |

Concretely: animations interpolate across ticks rather than stepping; hitsplats and sound cue
on the resolution frame; movement is smoothed between tick positions; and no input ever waits
for a tick boundary to be *acknowledged*, only to be *resolved*.

**`tickMs` lives in tunables** so it can be re-evaluated on a real phone at G3. But the
default is 600 and the fix for "combat feels sluggish" is presentation work, not a shorter
tick — shortening it silently changes every combat formula ported from isorpg.

#### 3.4.2 Death and the gravestone

Owner decision, 2026-09-09: **OSRS-style loss, with a gravestone that does not expire yet.**

- On death you **keep the 3 most valuable items** (by a defined value ordering; ties break
  deterministically on item id, never on inventory order).
- **Everything else — bag and worn equipment — goes to a gravestone at the death site.**
- **There is no expiry timer for now.** The gravestone waits indefinitely. `graveExpiryMs` is
  authored in tunables and set to "never" so a timer can be turned on later without a code
  change.
- You respawn at the last shrine/settlement you rested at.

**One rule this leaves open, which must be decided before G3, so here is the default:**
*what happens if you die again before recovering a gravestone?* Without a timer this is
reachable, and losing an old gravestone silently would be the single most enraging bug in an
Ironman game.

> **Default: one gravestone per player.** Dying again moves everything the old gravestone
> held to the new death site, merged with the new losses. Nothing is ever destroyed by a
> second death. If the merged pile would exceed the gravestone's capacity, the gravestone has
> no capacity limit — it is storage, not a container.

This is the safe default because it cannot lose items. The alternative (multiple simultaneous
gravestones) is more interesting and more punishing, and can be adopted later — but the
migration from one to many is trivial while the reverse is not, so start here.

**With no timer, death costs a walk rather than an item.** That is a deliberate softening for
now, and it is worth revisiting once the world is big enough that the walk itself is a real
cost. Note it as a balance lever, not a permanent stance.

#### 3.4.3 Magic — staves and runes

Owner decision, 2026-09-09. Magic survives the removal of the schools, re-themed along OSRS
lines. **There are no schools of magic, no spell cards, and no deck.**

- **One `Magic` skill**, trained by casting, exactly like Attack/Strength/Defence.
- **Staves and wands are weapons** with their own tier progression, made via Carpentry and
  Smithing from gathered materials.
- **Runes are ammunition.** They are *gathered and crafted*, not bought: mine or collect
  **essence**, then bind it into runes at altars placed in the world via the **Runecrafting**
  skill. Casting consumes them.
- **Spells are unlocked by Magic level**, not collected. A spellbook UI lists what you can
  cast; there is nothing to acquire, grade or build a loadout from.

**Why this shape is the right one here:** it makes magic a *consumable-driven* combat style,
which gives the Ironman loop another full gather → refine → use chain (essence → runes →
casts) and a real reason to keep a resource stocked. Melee costs nothing per swing; magic
costs runes you made. That asymmetry is the balance lever.

**Guard against drift:** the moment "spells" acquire rarity, collectability, or a loadout you
build before a fight, the card game is being rebuilt under a new name. See §3.7.

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
| Rendering | **three.js, orthographic camera, free yaw + constrained pitch** (§5) |
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
WebGL camera the z-buffer handles it for free.

The free-rotating camera (§5) settles this beyond argument: hand-written sort order under
arbitrary yaw is a losing fight, and rigged meshes seen from any angle are not something
Canvas 2D can do at all.

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
  Client and server share `@alderfell/sim` — identical logic, no duplication. The client
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

### 5.2 The camera

**Decision, 2026-09-09: a free camera. The locked isometric look is abandoned.**

An earlier draft of this plan argued for a camera locked at a fixed isometric angle, on the
grounds that it is a *budget* decision — models only ever look right from one angle, so
backfaces never show and buildings need no backs. The owner chose free rotation instead, and
that is the right call for an OSRS-style game: you rotate constantly to see round terrain and
line up a click. Record the cost honestly, because it is real:

> Every asset must now read correctly from **360° of yaw**. Nothing gets a missing back.

**What limits the damage: pitch stays constrained** (roughly 30–60° above the horizon). You
never see the top of a roof or the underside of anything, so roofs stay simple, interiors are
never visible from outside, and anything above eye level can be aggressively LOD'd.

**The consequence for art — this is the important one.** A free camera pushes decisively
toward **low-poly rigged 3D meshes over pre-rendered sprite sheets** for anything animated. A
sprite sheet under free yaw needs 8–16 directions × every animation frame × every gear
variant, which multiplies out of control on the first piece of equipment. A rigged low-poly
mesh animates once and works from every angle, at any zoom, with gear attached to bones.

**Pre-rendered sprites are not gone — they are demoted to where yaw doesn't matter:** item
and skill icons, UI, distant billboarded foliage, and flat ground decals. See §6.

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

### 6.1.1 The player avatar — one rig, light customisation

Owner decision, 2026-09-09. **A single humanoid rig for the player**, with a small set of
choices at character creation: head/face variant, hair, skin tone, and a colour or two.
Everything beyond that comes from **equipped gear**, attached to bones.

**Why this is the right call for a solo dev with AI:** one rig means one skeleton, one
animation set, and one retarget target for every free-asset character pack you ever import.
A second body type is not "one more model" — it is a second full animation set to author,
maintain and keep in sync forever, and it is where solo 3D projects historically drown.

Practical consequences to honour:
- **One skeleton, fixed joint names.** Every imported character is retargeted onto it. The
  free packs genuinely disagree here (a Mixamo-style 19-joint rig vs KayKit/Quaternius 41-joint
  skeletons), so the retarget step is a real, scripted part of the pipeline — not an
  afterthought.
- **Customisation is material and mesh-swap, never skeleton change.** Hair and head variants
  are swappable meshes parented to the same joints; skin and colour are material parameters.
- **Gear attaches to named bones.** One attachment table, shared by the world renderer and any
  character preview, so a preview can never drift from what you see in the world.
- NPCs and monsters use the same rig wherever plausible, which is most of the humanoid cast.

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

### 6.5 Art order — environment first

Owner decision, 2026-09-09. **Make the world look good before the characters do.**

Order of work:

1. **Environment** — terrain, foliage, rocks, water, buildings, roads, lighting, sky, fog.
2. **The player** — the one rig (§6.1.1), real animation, gear on bones.
3. **Named NPCs and monsters** — retargeted onto the same rig where they are humanoid.
4. **Everything else** — props, ambient crowd, VFX.

**Why this order is right:** environments are far more forgiving than characters. A slightly
wrong tree reads as a tree; a slightly wrong character reads as broken, because everyone is an
expert on how people and animals move. Environments also carry a screenshot better, which is
exactly what G1 is judged on. And a world that looks good makes placeholder characters read as
*unfinished*, whereas good characters in a bad world read as *misplaced*.

Until step 2 lands, characters stay as the existing procedural shapes — with their fallbacks
intact, which is what makes this staging safe at all (§6.3).

### 6.6 Asset budget

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

1. **Rename the project to Alderfell** in `Arcanum-Academy`: package scope `@arcanum/*` →
   `@alderfell/*`, the PWA manifest, the README, the Netlify site name. Keep the repository,
   keep the git history, keep the deployment.
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
| **G0 — Foundation reset** | Rename to Alderfell. Delete the cut features and the offline-accrual code. Flag off multiplayer. Camera → orthographic free-yaw, joystick deleted, tap-to-walk + rotate + pinch + long-press. | `npm run verify` green; the game boots and you can walk around by tapping. |
| **G1 — The look** ⚠️ | Port Oakenfall's palette, asset pipeline and PWA shell. Dress **the Shorelands** with real environment art — terrain, foliage, water, lighting — characters still placeholder (§6.5). | **A screenshot from the owner's actual iPhone, launched from the home screen, that looks good.** Nothing else proceeds until this passes. This is the gate isorpg identified as the most important in its plan, and the one previous projects failed. |
| **G2 — The loop** | Port isorpg's skills, XP, nodes, recipes. Grant tools. Bank. Walk → gather → craft → equip, all in the world. | A stranger plays 10 minutes and levels a skill without guidance. |
| **G3 — Combat** | Port the OSRS combat maths, attack styles, drop tables, food, death. | Killing one monster is satisfying twenty times in a row. |
| **G4 — A world** | The Shorelands finished end to end: character art (§6.1.1), named NPCs, day/night, weather, and the exits stubbed for the remaining four regions. | You can walk for five minutes and every stop is worth a screenshot. |
| **G5 — Content** | Quests, dungeons, clues, achievements, collection log, onboarding chain. | A stranger plays 45 minutes without guidance. |
| **G6 — Operations** | Save snapshots, then the admin panel, then analytics and the in-game report button. | You can find, inspect and safely repair any account, and undo it. |
| **G7 — Account recovery** | Supabase Auth (or chosen provider). Email-bound accounts, token rotation. | An account survives clearing site data. |
| **G8 — Async multiplayer** | Hiscores, profiles, collection comparison. | Two accounts can see each other's progress. |
| **G9+** | Live presence, grouping, standard mode + trading. | Per §8. |

---

## 14. Decisions log, and what is still open

### 14.1 Resolved

| # | Decision | Date |
|---|---|---|
| D1 | **The game is Alderfell.** Package scope `@alderfell/*`. | 2026-09-09 |
| D2 | **Premise: washed up on the coast of a fallen realm** (§1.1.1). Dark-medieval tone per Oakenfall. The premise is the diegetic justification for Ironman. | 2026-09-09 |
| D3 | **Cards, schools, grading, slabs, decks and card-duels are cut** (§3.7). | 2026-09-09 |
| D4 | **Magic stays, re-themed: one Magic skill, staves as weapons, runes as crafted ammunition, Runecrafting as the supporting skill** (§3.4.1). | 2026-09-09 |
| D5 | **No offline progression.** The accrual code is deleted, not disabled (§3.2). | 2026-09-09 |
| D6 | **Free camera** — orthographic, free yaw, constrained pitch. The locked isometric look is abandoned, and with it the single-angle art budget (§5.2). | 2026-09-09 |
| D7 | **Tap-to-walk, drag to rotate, pinch to zoom, long-press for a context menu. No virtual joystick** (§5.1). | 2026-09-09 |
| D8 | **Ironman is the default and only mode at launch.** No player trading (§7). | 2026-09-09 |
| D9 | **Unity is rejected** (§4.2). Web + three.js + PWA. Blender is a build-time tool in CI. | 2026-09-09 |
| D10 | **`Arcanum-Academy` is the spine**; the other three repositories are frozen quarries (§10). | 2026-09-09 |
| D11 | **Death: OSRS-style.** Keep the 3 most valuable items; everything else to a gravestone at the death site, **with no expiry timer for now**. One gravestone per player — a second death merges into it, so nothing is ever destroyed (§3.4.2). | 2026-09-09 |
| D12 | **600 ms tick, with presentation decoupled from it.** The tick is a simulation property; input is acknowledged on the frame and only *resolved* on the tick (§3.4.1). | 2026-09-09 |
| D13 | **30 bag slots, plus a separate equipment screen** — worn gear never occupies bag slots (§3.2). | 2026-09-09 |
| D14 | **One player rig with light customisation** at creation; all other visual identity comes from gear on bones (§6.1.1). | 2026-09-09 |
| D15 | **One zone at launch, graph designed for five.** The Shorelands must exercise all 14 skills, a dungeon and a boss; the other four regions are stubbed exits (§3.1). | 2026-09-09 |
| D16 | **Environment art before character art.** Characters stay placeholder through G1 (§6.5). | 2026-09-09 |
| D17 | **Agents build whole gates autonomously and stop on any design decision** (§15.1). | 2026-09-09 |
| D18 | **Claude owns `sim`/`shared`/`server` and architecture; Codex owns content JSON, `tools/`, UI polish and pattern-following ports** (§15.2). | 2026-09-09 |

### 14.2 Still open

**Q1 — Grading/serials.** §3.7 flags serialised provenance as salvageable. Does a rare drop
knowing it is the 47th ever made add anything in an Ironman game where nobody trades? Lean
no; revisit only if a standard trading mode ever ships.

**Q2 — The differentiator.** The most important open question, and the one four repositories
have not answered. From ALA's own migration doc: *"the game is a broad, well-tested systems
sandbox without a sharp identity. Breadth is not the problem. The missing piece is a reason
to play this one."* Candidate answers: the player-owned hold as a real production base
(§3.5); Ironman-by-default as an identity rather than a mode; the fallen-realm premise
carried harder than most OSRS-alikes bother to. **Do not let this block G0–G3** — the answer
usually arrives from playing, not planning — but do not lose the question either.

---

## 15. Working agreements

### 15.1 Autonomy — build whole gates, stop on design

Owner decision, 2026-09-09. **Take a whole gate (§13), build it, verify it, push it, and
report back short.** The owner reviews the result, not the plan. He works from a phone; a
plan-approval round trip per step is the wrong shape.

**Stop and ask the moment something would change gameplay, balance or feel.** That includes:
a tunable that changes difficulty or pacing, a drop rate, an XP curve, anything touching the
death penalty or Ironman's promise, a control or camera change, and any new player-facing
system not already in §3. Engineering-quality decisions — refactors, test structure, file
layout, naming — are yours to make; just record them.

**When you stop, stop usefully.** Do every part of the gate that does not depend on the
answer, then ask a single specific question with options, and say what you have already
finished. Never sit idle on a whole gate waiting for a reply about one number.

**Report format:** what changed, what it looks like, what is verified, what is still open.
Short. The diff is the detail.

### 15.2 Two AIs — who does what

The owner directs **Claude Code** and **ChatGPT Codex**. Both are capable; the failure mode
is not capability, it is two agents editing the same files with different assumptions. The
division below is drawn along the lines the architecture already enforces.

| Lane | Owner | Why |
|---|---|---|
| `packages/sim`, `packages/shared` | **Claude** | Determinism lives here. Draw order, seeded RNG, tick logic and the hash contract are invisible when wrong (§12) and cannot be caught by review of a diff alone. One agent holds this. |
| `packages/server`, persistence, identity, admin | **Claude** | Optimistic concurrency, transactions, auth and audit. Same reasoning: correctness that a passing test does not prove. |
| Architecture, boundaries, ADRs, tunables schema | **Claude** | Structural decisions need one consistent mind. |
| `content/data/*.json` — items, recipes, nodes, monsters, drop tables, quests | **Codex** | Bounded, repetitive, pattern-following, high-volume — and **validated at load** (ADR-0005), so a mistake fails loudly at module load rather than lurking. This is the safest possible lane for a second agent, and the highest-volume work in the project. |
| `tools/` — asset scripts, Blender Python, importers | **Codex** | Self-contained, testable by running them, no shared state. |
| UI polish, CSS, layout, copy | **Codex** | Visually verifiable, low blast radius. |
| Repetitive porting once a pattern exists | **Codex** | Once Claude has ported one system from isorpg and established the shape, the next eight are mechanical. |

**The four rules that stop them colliding:**

1. **Never run both on the same branch at the same time.** One branch per gate, per agent.
2. **Both read `AI_HANDOVER.md` first, every session.** It is the shared assumption set. An
   agent that has not read §12 will reintroduce a trap that has already been paid for.
3. **`packages/sim` is Claude-only.** If Codex needs a change there, it says what it needs
   rather than making it. This is the one hard boundary.
4. **Whoever finishes updates this document in the same commit.**

If a review pass is wanted, Codex reviewing Claude's systems work is genuinely useful — a
second reader catches assumption errors that tests do not. Reviewing is not the same as
editing; keep the edit in the owning lane.

### 15.3 General

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
