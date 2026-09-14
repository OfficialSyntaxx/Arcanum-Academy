# Phase plan — systems work on `claude/systems-phases`

> Companion to `docs/NEXT_PHASES.md`, which surveys what exists. This file is the
> execution plan: what gets built, in what order, in which files, and what each phase
> has to prove before it is called done.
>
> `AI_HANDOVER.md` remains the single source of truth. Where this plan and the code
> disagree, the code wins and this file is the bug.

## Branching

| Branch                  | Owner  | Scope                                                          |
| ----------------------- | ------ | -------------------------------------------------------------- |
| `codex/g1-shorelands`   | Codex  | G1 art: environment assets, palette, mobile HUD, smoke harness |
| `claude/systems-phases` | Claude | This plan: `shared`, `sim`, `server`, world data, `tools/`     |
| `main`                  | —      | Integration                                                    |

The two branches are disjoint by construction. Codex holds `packages/client/src/render/`,
`packages/client/src/world/` (asset and scene layers), `assets/`, `public/` and the visual
Playwright specs. This plan touches `packages/shared/`, `packages/sim/`, `packages/server/`,
`tools/scripts/` and — only where a phase needs an affordance — small, named client files
listed per phase. Any file not listed in a phase's **Touches** block is out of scope for that
phase.

Integration rule: **rebase this branch onto `main` after G1 merges, never merge `main` into
it mid-flight.** Whichever lands second resolves.

---

## The architectural fact that shapes everything below

NPC agents are stepped **on the client only** — `packages/client/src/npc/npc-director.ts:117`
calls `stepNpcAgent` in the render loop. The rules live in `sim` and are deterministic, so
every client independently computes the same professor in the same place without a byte of
network traffic. That is a good design and it stays.

It does not generalise. The moment an actor can damage you, take your items, or be killed for
loot, a client-computed position is a client-authored claim. So the plan uses **two tiers**,
and the tier is a property of the actor, not of the code:

| Tier              | Stepped by                   | May affect player state | Examples                        |
| ----------------- | ---------------------------- | ----------------------- | ------------------------------- |
| **Ambient**       | Client, from the world clock | No                      | Professors, students, the crowd |
| **Authoritative** | Server, on the 600 ms tick   | Yes                     | Creatures, anything that fights |

Phase 3 introduces the second tier. That is its real cost and the reason it wants an ADR.

---

## Phase 0 — a clean floor (half a day, no decisions)

Small, immediate, unblocks the rest.

**0.1 — fix the two unformatted files.** `packages/client/src/world/collision.ts` and
`world-service.ts` fail `npm run format:check` on `main` today, so `npm run verify` is red for
everyone before anyone edits anything. They are in Codex's area, so this is a **prettier-only**
commit with zero logic change — trivially rebasable.

**0.2 — a determinism guard test.** `sim` bans `Math.random`/`Date.now` by convention and
review. Add the test that proves it: run a fixture simulation twice from one seed and assert
identical state hashes, and assert the same for `stepNpcAgent` over a thousand steps. §12 of
the handover is explicit that a check nobody has seen fail is a check nobody should trust — so
this lands with a deliberately broken variant demonstrated in the commit message.

**Touches:** `packages/client/src/world/collision.ts`, `world-service.ts` (format only),
`packages/sim/src/__tests__/determinism.test.ts`.
**Done when:** `npm run verify` is green from a clean checkout.

---

## Phase 1 — NPCs that do what they were authored to do (2–3 days, no decisions)

The highest visual return per line in the repo, and it needs nothing from Codex.

**1.1 — `stepNpcAgent` branches on `NpcActivity`.** Seven activities are authored in world data
and the stepper reads none of them. Give each a movement signature:

| Activity | Behaviour                                                                  |
| -------- | -------------------------------------------------------------------------- |
| `IDLE`   | Hold position, hold facing.                                                |
| `WANDER` | Today's disc drift, unchanged.                                             |
| `TEACH`  | Hold a fixed spot, face the nearest `lectern`-tagged waypoint, long dwell. |
| `TEND`   | Walk a short circuit between the tagged waypoints inside the post radius.  |
| `TRADE`  | Hold the stall face, short dwell, small lateral shuffle only.              |
| `STUDY`  | Very long dwell, near-zero drift.                                          |
| `SPAR`   | Pace between two points, longer stride, no dwell.                          |

Facing becomes part of `NpcAgent` rather than a renderer guess. Determinism is preserved: every
branch draws from the same id-seeded `Rng`.

**1.2 — barks keyed by activity and world hour.** `selectBark` currently rotates one flat list
per NPC. Widen `NpcDefinition.barks` from `readonly string[]` to a keyed structure with a
default list, keeping a migration that reads the old shape so no content breaks on the way. A
professor mid-`TEACH` says something about the lesson; at dusk, something about the evening.
Still a pure function of `(id, activity, hourBand, rotation)`.

**1.3 — the schedule gains an arrival window.** Every NPC currently repaths on the exact minute
its entry starts, so the whole cast moves in lockstep. Offset each agent's transition by a
deterministic per-id jitter so the academy changes over a couple of minutes rather than on a
frame.

**Touches:** `packages/sim/src/npc.ts`, `schedule.ts`, `packages/shared/src/world/types.ts`,
the four zone files (bark content), `packages/client/src/npc/npc-director.ts` (facing
passthrough only).
**Proves it works:** unit tests per activity asserting the movement signature; a determinism
test that two agents with the same id and clock produce identical paths; watching the Courtyard
and seeing the cast stop looking like one organism.

---

## Phase 2 — the world-data linter (1–2 days, no decisions)

`tools/scripts/check-boundaries.mjs` already establishes the pattern: an executable rule that
fails CI. World data deserves the same, and it is the cheapest quality win available.

**2.1 — `tools/scripts/check-world.mjs`, wired into `npm run verify`.** Fails on:

- an `Interactable.approach` naming a waypoint that is not in the same zone
- an asymmetric waypoint link (A lists B, B does not list A)
- a waypoint unreachable from the zone's entry portal
- an NPC schedule naming a waypoint that does not exist
- a `ZonePortal` whose `targetZone` has no portal back
- a `ScheduleEntry` list that is empty, unsorted, or has a `startMinute` outside 0–1439
- an interactable whose `approach` is further from its `position` than the interaction radius
  — the one that produces a prompt you can see but never trigger
- a drop table referencing an item id not in the catalog

**2.2 — the mutation proof.** Each rule ships with a test that constructs a deliberately broken
zone and asserts the linter rejects it. A linter whose failure path has never run is decoration.

**Touches:** `tools/scripts/check-world.mjs`, `package.json`,
`tools/scripts/__tests__/check-world.test.mjs`.
**Done when:** the linter catches every defect above in a fixture, and the four real zones pass.

---

## Phase 3 — creatures that act (1–2 weeks, **blocked on decisions**)

The big one. Do not start 3.1 until the questions in §Decisions are answered.

**3.1 — ADR-000N: server-authoritative actors.** Written and merged _before_ the code. It
records the two-tier model above, why creature state leaves the player record, the tick budget,
and what happens to a creature when its only player disconnects.

**3.2 — `packages/sim/src/creature.ts` — the pure FSM.**
`IDLE → ALERT → PURSUE → ATTACK → FLEE → DEAD → RESPAWN`, stepped on the 600 ms tick, injected
`Rng` seeded from the creature instance id, injected clock. Rules:

- **Aggro radius** with OSRS's de-aggression rule: a creature ignores a player whose combat
  level exceeds twice its own. This is the mechanism that keeps a starting zone traversable at
  level 60 instead of becoming a gauntlet.
- **Leash** — pursuit bounded by a distance from the spawn anchor; past it, disengage and walk
  home at a reduced speed, un-targetable until home. Makes fleeing a real tactic, legibly.
- **Its own attack cadence**, independent of the player's taps. The existing
  `resolveSparringAttack` keeps the player's side unchanged; a mirrored
  `resolveCreatureAttack` resolves the creature's, so both sides share the cooldown semantics.
- **Flee below a species threshold**, so not every animal is a wall that fights to the death.

Every constant above is a `DEFAULT_TUNABLES` entry per the standing rule, not a literal.

**3.3 — species and spawners in `shared`.** `CreatureSpeciesDefinition` (hp, damage, speed,
aggro radius, leash, flee threshold, drop table, XP, required level, model intent) and
`CreatureSpawnerDefinition` (species, anchor waypoint, roam radius, population, respawn window).
The two frozen literals in `encounters.ts` become a species plus a spawner each; the existing
interactable ids stay valid so live saves and `The First Hunt`'s kill counter keep working.

**3.4 — the server ticks the population.** A per-session zone population, created on zone
entry, stepped on the server clock, patched to the client. Creature state moves out of
`PlayerState.combatTargets`, with a read-migration for existing saves exactly as the
Attack/Strength/Defence split did on 2026-09-13.

**3.5 — the client renders what the server says.** Positions and states arrive in the patch;
the client interpolates between ticks and nothing more. The existing creature renderer already
chooses animation clips by intent, so the clip work is done. **No new art** — this phase reuses
the bundled Wolf and Armabee GLBs.

**Touches:** `packages/sim/src/creature.ts`, `combat.ts`, `packages/shared/src/combat/`,
`packages/shared/src/config/` (tunables), `packages/server/src/net/handlers/combat.ts`,
`packages/server/src/domain/player-state.ts`, `packages/client/src/combat/`, `docs/adr/`.
**Proves it works:** the FSM unit-tested per transition; a determinism test over a long run;
a server test that a creature's damage is never accepted from the client; and the real check —
a wolf notices you from across the beach, chases, and you can lose it by running.

---

## Phase 4 — dialogue and quest verbs (1 week, one tone decision)

Unblocks the whole of G5, and Phase 1's activity work makes it land better.

**4.1 — a dialogue node graph in `shared`.** Nodes, player responses, conditions over quest and
skill state, and effects that call the existing server-authoritative quest handlers. Content
lives in JSON validated at module load, like every other catalog.

**4.2 — NPCs can give and complete quests.** The Notice Board stops being the only quest
surface. It stays — a board is a good affordance — but a quest can now start with a person.

**4.3 — new objective kinds:** `talk_to`, `reach_waypoint`, `use_station`. Each is small once
4.1 exists, and together they turn the quest catalog into something that can express a quest
_line_ rather than a list of fetch-and-kill.

**Touches:** `packages/shared/src/quests/`, `packages/shared/src/content/`,
`packages/server/src/net/handlers/quests.ts`, `packages/client/src/ui/NpcDialogue.tsx`.

---

## Phase 5 — the map (scope depends on a decision)

Held until §Decisions Q2 is answered, and best done after Phase 3 so a new area can be
populated rather than decorated. Phase 2's linter is what makes this affordable.

- **5.1 — zone descriptors:** palette band, ambience, level band, species set, skill emphasis
  declared once per zone so a new zone starts from a template, not from a 593-line copy of
  `courtyard.ts`.
- **5.2 — the region graph as data:** one structure feeding travel, the map screen and
  eventually teleports, instead of portals naming targets ad hoc.
- **5.3 — the authored expansion itself**, per whichever answer Q2 gets.

---

## Order, and what is safe to start now

| Order | Phase                      | Blocked by             | Owner decision |
| ----- | -------------------------- | ---------------------- | -------------- |
| 1     | **0 — clean floor**        | nothing                | none           |
| 2     | **1 — NPC activities**     | nothing                | none           |
| 3     | **2 — world linter**       | nothing                | none           |
| 4     | **3 — creatures**          | ADR                    | **yes, Q1**    |
| 5     | **4 — dialogue and verbs** | nothing (best after 3) | tone           |
| 6     | **5 — the map**            | 2, 3                   | **yes, Q2**    |

Phases 0, 1 and 2 are roughly a week of work between them, need no decisions, touch nothing
Codex holds, and leave the repo measurably better whichever way the two questions are answered.
**That is what I would start on.**

---

## Decisions needed from the owner

Per the standing rule, these are gameplay and feel, so they are not mine to make.

**Q1 — aggression.** Does a creature attack you unprovoked, and where? This is the single
dial between "cosy" and "OSRS", and Phase 3's whole shape depends on it.
_Recommendation: yes, but only outside the academy walls; the Courtyard stays safe forever._

**Q2 — map shape.** One dense Shorelands, or four distinct zones? D15 says the first; the code
has drifted toward the second without the content to support it.
_Recommendation: D15 — demote Forest/Mountains/Snow to genuine stubs and spend the whole budget
on the Shorelands. It is also what G4 is written against._

**Q3 — fleeing.** Does running from a fight cost anything, or is distance the only cost?
_Recommendation: free, consistent with D20's no-run-energy stance._

**Q4 — dialogue tone.** How much does an NPC say before it is in the way on a phone? Two lines
and a choice, or a real conversation with a scroll?
_Recommendation: two lines and at most three responses; this is a mobile game._
