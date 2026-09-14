# Next phases — work available beside Codex's G1 art lane

> Status: proposal. Nothing here is committed to until the owner picks from §5.
> `AI_HANDOVER.md` remains the single source of truth; this file is a survey of the
> code as it stands on 2026-09-14 and a recommendation of what to build next.

Codex owns the G1 lane on `codex/g1-shorelands`: environment assets, palette, mobile HUD,
Playwright smoke harness (`docs/G1_RETURN.md`). Per D18 that is content, `tools/` and UI
polish. Everything proposed below lives in `shared`, `sim` and `server` — the Claude side of
the split — so it can proceed in parallel without touching a single file Codex is holding.

Two standing constraints shape all of it:

- **G1 is still the gate.** None of this work may be used as a reason to call G1 passed, and
  none of it should add a renderer requirement that competes for the art pass. Where a system
  needs presentation, it gets the smallest honest client surface and no art budget.
- **No stubs.** Each phase below is scoped so it ships whole: rules in `sim`, authority in
  `server`, persistence in the player record, a real client affordance.

---

## 1. Where the code actually left off

Verified by reading the code, not the handover. Where the two disagree, this section is the
code.

| System     | State                                                                                                                                                                                                | The gap                                                                                                                                                                                                                                                                                                                          |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gathering  | `packages/sim/src/economy/gathering.ts` — tick-resolved, drop tables, depletion at `depletionHarvests`, dormancy, `regenerationMs`, tool durability and a depleted-tool yield multiplier             | None worth naming. This is the most finished system in the repo and is the model the others should follow.                                                                                                                                                                                                                       |
| Combat     | `packages/sim/src/combat.ts` + `packages/server/src/net/handlers/combat.ts`                                                                                                                          | **Wholly reactive.** `resolveSparringAttack` only runs when the player taps attack, and `enemyDamage` is applied inside that same call. A creature never acts on its own: it cannot notice you, approach, flee, or hit you while you stand still. Walking away mid-fight is free and costless.                                   |
| Encounters | `packages/shared/src/combat/encounters.ts` — two frozen definitions, Shore Wolf and Emberwing Armabee                                                                                                | Each is a **fixed point in space** (`position: {x, z}`) bound to one interactable. There is no creature spawner, no roaming, no aggression radius, no multi-instance population. Adding a third animal is a copy of a literal, not a content entry.                                                                              |
| NPC agents | `packages/sim/src/npc.ts`, `schedule.ts`                                                                                                                                                             | Schedule → waypoint → dwell → drift inside the node disc. Deterministic and cheap — the right architecture. But `NpcActivity` has seven members (`TEACH`, `TEND`, `TRADE`, `STUDY`, `SPAR`…) and **the stepper reads none of them**: every activity produces identical disc-drift. The authored vocabulary exists and is unused. |
| Dialogue   | `selectBark` + `packages/client/src/ui/NpcDialogue.tsx`                                                                                                                                              | One deterministic line, a Continue button, nothing else. No branching, no quest hook, no state. An NPC cannot give, advance or complete a quest — only the Notice Board can.                                                                                                                                                     |
| Quests     | `packages/shared/src/quests/catalog.ts` (140 lines), server-enforced                                                                                                                                 | Catalog-driven and genuinely extensible for _resource_ and _kill-count_ objectives. Cannot express: talk-to, reach-a-place, use-a-station, or any branch.                                                                                                                                                                        |
| World      | 4 zones. Courtyard: 33 waypoints, 6 named NPCs, both encounters, every station. Forest / Mountains / Snow: 11–13 waypoints, 3 NPCs, 2 gathering nodes, 1 station, 1 merchant, 1 board, 1 portal each | The three outer zones are **structurally identical templates**. They have no combat, no quests, no reason to be reached, and no difference in what you do there. They are exits with furniture.                                                                                                                                  |

The honest one-line summary: **the economy is deep, the world is wide but flat, and everything
that moves is on rails.**

---

## 2. Phase A — creatures that act (highest value, `sim` + `server`)

This is the recommended first phase, because it is the one the player feels in ten seconds and
because it is the load-bearing dependency for map expansion (§3): an outer zone is only worth
walking to if something lives there.

**A1 — an autonomous creature actor in `sim`.** A new `packages/sim/src/creature.ts`, stepped
by the kernel on the 600 ms tick alongside NPC agents, with the same determinism rules (injected
`Rng` seeded from the creature id, injected clock, no `Math.random`/`Date.now`). States:
`IDLE → ALERT → PURSUE → ATTACK → FLEE → DEAD → RESPAWN`. Drives:

- **Aggression radius and level check.** A creature notices a player inside `aggroRadius`. Keep
  OSRS's rule: a creature stops being aggressive to a player whose combat level is more than
  double its own — it is the mechanism that makes a starting zone stay traversable forever.
- **Leash.** Pursuit is bounded by a distance from the spawn anchor; beyond it, the creature
  disengages and walks home. This is what makes "run away" a real, legible tactic instead of a
  bug.
- **Its own attack cadence.** The creature attacks on its own timer, not on the player's tap.
  `resolveSparringAttack` keeps the player's side; the mirror function resolves the creature's.
- **Flee at low HP** for the timid ones, so not every animal is a wall that dies fighting.

**A2 — spawners replace fixed positions.** A `CreatureSpawnerDefinition` in
`shared/src/combat/` naming a species, an anchor waypoint, a roam radius, a population count
and a respawn window. `COMBAT_ENCOUNTERS`' two literals become species definitions plus
spawners; the third creature is then a content entry, which is the whole point.

**A3 — the server owns the population.** Creature state moves out of the player record's
`combatTargets` map and into a per-zone authoritative population the server ticks. This is the
one genuinely significant architectural change in this document and it wants an ADR, because it
introduces server-side entities with a lifetime independent of any session. Ironman and
single-player make the scope tolerable: the population is per-player-instance, not shared.

**Owner decisions this needs** (do not start A1 without them):

- Does a creature hit you while you are standing still doing nothing? (This is the difference
  between "cosy" and "OSRS".) Recommendation: yes, but only in designated wild areas, never in
  the Courtyard.
- Aggression in the starting zone: none, or only outside the academy walls?
- Does fleeing a fight cost anything?

---

## 3. Phase B — map expansion with a reason to travel (`shared`, content-shaped)

D15 says one zone at launch with four stubbed exits, and the Shorelands must exercise all
fourteen skills. The three outer zones as built quietly contradict that: they are not stubs,
they are four-fifths of a duplicate Courtyard each. Two coherent readings, and the owner must
pick:

**B-narrow (recommended, and what D15 actually says).** Demote Forest / Mountains / Snow back
to real stubs — a portal, a short approach, a locked or "not yet" sign — and spend the entire
map budget on making the **Shorelands** dense: more waypoints, real interior spaces, a
shortcut network, elevation, a cave, a boss approach. One excellent zone beats four thin ones,
and it is what G4 is written against.

**B-wide.** Keep four zones and give each one an identity: a species set only it has, a
skill it gates (Mining is only serious in the Mountains), a quest that sends you there, and a
level band. This is roughly four times the content work and it is the path every sibling repo
took before running out of steam.

Either way, three pieces of engineering are worth doing **now**, because they are the
difference between authoring a zone in a day and authoring one in a week:

- **B1 — a zone authoring lint.** `tools/scripts/` already hosts an executable architecture
  linter; the same trick applies to world data. Fail the build on: an interactable whose
  `approach` is not a waypoint in the same zone, an asymmetric link, an unreachable waypoint,
  an NPC schedule naming a waypoint that does not exist, a portal whose target zone has no
  return portal. Every one of these is a class of bug that currently only appears when you
  walk into it.
- **B2 — zone-level content descriptors.** Zone files are 250–600 lines of hand-written
  literals. A zone should declare its palette band, ambience, level band, species set and
  skill emphasis in one place so a new zone starts from a template rather than from a copy of
  `courtyard.ts`.
- **B3 — connectivity as data.** Portals currently name a target zone. Make the region graph
  explicit so travel, the map screen, and eventually teleports read from one structure.

B1 is worth doing regardless of which reading wins, and is the single cheapest quality win in
this document.

---

## 4. Phase C — NPCs that read as inhabitants (`sim` + a small `shared` surface)

The schedule architecture is right and should not be replaced. What is missing is that the
authored intent is thrown away at the last step.

- **C1 — make `NpcActivity` mean something.** `stepNpcAgent` should branch on the activity:
  `TEACH` faces a lectern and stays put; `TEND` walks a short circuit between two nearby
  points; `TRADE` holds a stall face; `WANDER` keeps today's disc drift; `SPAR` paces a
  terrace. This is perhaps sixty lines in `npc.ts`, changes no content, breaks no determinism,
  and is the highest visual return per line of code in the repo.
- **C2 — activity-aware barks.** `selectBark` currently rotates one flat list. Key barks by
  activity and by world hour, so the professor says something about the lesson during `TEACH`
  and something about the evening at dusk. Still deterministic, still a pure function of
  (id, activity, rotation).
- **C3 — a real dialogue node graph.** A small, content-driven structure: nodes, player
  responses, conditions on quest and skill state, and effects that hand back to the existing
  server-authoritative quest handlers. This is what lets an NPC give a quest, which is what
  §3.5's content plan assumes and what the Notice Board is currently standing in for.
- **C4 — quest objective kinds beyond fetch and kill.** `talk_to`, `reach_waypoint`,
  `use_station`. Once C3 exists these are small, and together they are the difference between
  a quest catalog and a quest _line_.

C1 and C2 are safe to start immediately: no owner decision, no design change, no dependency on
Codex or on G1.

---

## 5. Recommended order, and what I would start on

|     | Phase                                                 | Depends on             | Owner decision needed first       |
| --- | ----------------------------------------------------- | ---------------------- | --------------------------------- |
| 1   | **C1 + C2** — activity-driven NPC behaviour and barks | nothing                | none                              |
| 2   | **B1** — the world-data linter                        | nothing                | none                              |
| 3   | **A1–A3** — autonomous creatures                      | B1 helps, not required | **yes** (§2)                      |
| 4   | **C3 + C4** — dialogue graph and objective kinds      | none, but best after A | tone of the dialogue              |
| 5   | **B2 + B3 + the map itself**                          | B1, A2                 | **yes** — B-narrow vs B-wide (§3) |

I would start on **C1, C2 and B1 today**: three self-contained wins, no design questions open,
no overlap with Codex's branch, and B1 will pay for itself the moment any map work starts.

**The two questions that block the rest, restated plainly:**

1. Do creatures attack you unprovoked, and if so, where?
2. One dense Shorelands, or four distinct zones?
