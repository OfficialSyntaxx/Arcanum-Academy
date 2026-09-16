# Updates — branch `Claudesep16`

Running log of what this branch changed, why, and where it stopped. Written for whoever
picks the work up next, human or agent. `AI_HANDOVER.md` remains the single source of truth
for the design; this file only records the state of this branch against it.

**Branch:** `Claudesep16`, cut from `main` on 2026-09-16. Nothing here has been merged.
**Owner instruction on this branch:** never push to `main` without explicit approval.

---

## Why this branch exists

The owner reviewed the live build on an iPhone and reported, in their words: the world feels
small and easy to finish; the wolf and bat models look off with a red aura floating over them;
the NPC models look bad; proportions are off; and the whole thing reads as "touch this,
complete this, finish" rather than an OSRS-like RPG with creatures that fight you.

Every change below follows from that list.

---

## Decisions the owner made during the work

These were escalated as design decisions (per `CLAUDE.md`'s operating rules) and answered.
Do not reverse them without asking.

| #   | Decision                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Combat is OSRS-style and automatic.** Walk up to a creature and engage it; passive and aggressive creatures both exist. Every combat level (Attack, Strength, Defence) must measurably improve accuracy, max hit and avoidance. |
| 2   | **Do not delete the existing world.** Keep the Courtyard as a small hub to improve later, and build larger zones around it. Enlarge first, populate after.                                                                        |
| 3   | **Quaternius rigged characters,** not the Kenney chibi figures, which read as "tiny and compact". The player wears the hooded ranger.                                                                                             |
| 4   | **No ground rings.** Tap-highlight reads better. The existing highlight on gathering nodes is fine for now.                                                                                                                       |
| 5   | **Minimise fixed UI.** Too much chrome hides the game world; a way to collapse everything is wanted.                                                                                                                              |
| 6   | **Nothing paid, ever.** Blender and CC0 assets only. This ruled out buying the full Quaternius animation library, which is why locomotion is procedural (see below).                                                              |
| 7   | **Characters must not look like miniature figurines** in a big world.                                                                                                                                                             |

---

## What changed, in order

### 1. Combat (commit `f569c0c`)

- Both sides now roll on every 600 ms tick using the OSRS effective-level formula
  (`level + 8 + style bonus`) in `packages/sim/src/combat-rolls.ts`. The authored damage
  floor is gone; a zero is a real miss that still spends the tick.
- Creatures carry their own Attack, Strength, Defence and an `aggressive` flag in
  `packages/shared/src/combat/encounters.ts`.
- One tap starts a fight and blows then trade themselves. The client paces the next
  exchange from the receipt of the last confirmed one, never from the server clock, so a
  phone with a skewed clock cannot spam or stall. Walking away ends the fight.
  See `driveCombat()` in `packages/client/src/app/hub-controller.ts`.
- **Known trust gap, accepted for single-player:** aggression is client-initiated, so a
  modified client could decline to be attacked. The server still validates range, level,
  zone and cooldown on every swing.
- Presentation: the red rings, posts and halos over creatures are deleted. The animated
  model is the tap target, on a faint trampled-earth disc. Creatures are scaled per type,
  have contact shadows, amble inside a leash when idle, square up and close in a fight,
  flash on hit, show a billboard health bar only while targeted, and dissolve on defeat.
  Hitsplats (red damage, blue miss) pop over whoever was struck.
- The fight card became a slim bottom strip with stance chips and food. **There is no
  attack button.**

### 2. Character pipeline and rig (commits `5e68aed`, `574c8bc`)

- `tools/scripts/build-characters.mjs` (`npm run build:characters`) grades CC0 Quaternius
  sources into small runtime GLBs under `assets/derived/characters/`: PBR maps stripped,
  base colour shrunk to a small WebP, meshopt decimation, quantization, and only the
  animation clips actually used. Creatures go through the same script.
- Every human is the same 65-joint rig. Outfits are clothes only, so the script crops the
  base body's head, hair and eyes above the neck and merges them in.
- **The free Universal Animation Library has no plain idle or walk clip.** Locomotion is
  therefore procedural in `packages/client/src/player/character-rig.ts`: a breathing idle
  and a run cycle posed directly on hips, knees, shoulders, elbows and spine, blended
  continuously with speed and hand-blended against the action clips (the mixer's own fades
  go to the T-pose, which is why the blending is manual). Buying the full library would
  replace only this gait — and is ruled out by decision 6.
- The anonymous crowd uses the same rig; the instanced capsule pool is only a cold-load
  stand-in now.
- The female ranger outfit is built but **not shipped**: the 3 MiB precache budget could
  not take a fourth outfit.

### 3. World (commits `cda30c7`, `cc550fc`, `a5839d8`)

- Emberwood Reach 105 m → 190 m, Cindermark Heights → 192 m, Frostgate Reaches → 189 m.
  The Courtyard is untouched, as decided.
- Each region gained a wilds area: Emberwood wolf den and armabee glade, Cindermark scree
  den and a Cinder Wisp, Frostgate frost hollow and a Rime Wisp. Wolf packs step up in
  level per region; wisps are passive, hard-skinned and pay crystal.
- Scenery is a deterministic scatter (`environment-assets.ts`) around each zone's authored
  routes, culled along links, waypoints, interactables, water and buildings, with density
  per device tier. **Collision mirrors exactly what renders.**
- Per-region ground palettes and an emissive grade on the shared scenery models. The models
  are vertex-coloured, so a colour tint does nothing; an emissive lift is what frosts or
  dusts them.
- Every overworld station and node now has server content: mountain seams feed the Foothill
  Forge (Resonant Ingot), snow berries and creek feed the Frostgate Workshop (Frost Berry
  Preserve), the Lumber Mill mills Emberwood Planks.

### 4. Camera, scale and HUD (commits `803ae5a`, `a4ce982`, `85c97f4`)

- Default camera 26 m → 15 m across the short axis; figures at 2.05 m, slightly over life
  size on purpose, because the zones are authored broad.
- OSRS-shaped HUD: minimap top-right drawn from zone data and turning with the camera,
  compact zone strip, one-line journey link, four-tab bar (Satchel, Journal, Map, Log).
  The floating Satchel and Map buttons and the hint strip are gone. A fold control hides
  every fixed overlay; the connection readout collapses to a dot in play.

### 5. Combat gear (this commit)

The first equipment tier, which is what gives Resonant Ingots and Emberwood Planks a sink and
makes the crafting chain pay into combat.

- `EquipmentSlot` (Weapon, Body, Shield) and `EquipmentProperties` in
  `packages/shared/src/items/types.ts`. Slots are added only as gear for them exists, so the
  equipment screen never shows a row nothing can fill. The full launch list is §3.2.
- Three pieces, all forged at the Foothill Forge from outer-zone materials: **Resonant Blade**
  (Refining 10, Attack 5 to wear, +12 attack, +10 strength), **Emberwood Shield** (Refining 6,
  Defence 5, +14 defence), **Resonant Hauberk** (Refining 14, Defence 8, +20 defence).
- `equipment.equip` and `equipment.unequip` on the server. A swap is atomic inside one state
  build, so **a full satchel refuses the swap rather than destroying what was worn**; there is
  a test for exactly that.
- The combat handler now sums worn bonuses into the rolls. Before this, every
  `attackBonus`/`strengthBonus`/`defenceBonus` in the game was zero.
- Equipment screen shows the three slots, the summed bonuses and the gathering tools below;
  gear in the satchel gains a Wear button.

**Worth knowing, and deliberate:** the OSRS max-hit divisor is 640, so at low levels a
strength bonus rounds away entirely and changes nothing. Early gear is therefore sold on
accuracy (+12 on a base of 64 is about a fifth more attack roll, felt immediately at any
level). `packages/sim/src/__tests__/combat-rolls.test.ts` asserts both halves of this so
nobody "fixes" it later by inflating the numbers.

### 6. Camera framing and occlusion (this commit)

Chasing the owner's "miniature figurines" note.

- **Pitch band brought back to the §5.2 spec.** It had drifted to 45-69 degrees above the
  horizon; the spec is 30-60. Under an orthographic camera a standing figure's screen height
  is its height times `cos(pitch)`, so looking down that steeply was costing about 15% of
  every character's apparent height. Band is now 0.52-1.05 rad and the default opens at 0.68.
- **Buildings between the camera and the player now fade** to 22% opacity, using a
  segment-versus-box test against the authored building rectangles rather than a raycast, so
  it cannot disagree with collision and costs nothing per frame. Each building owns its
  materials so one can fade without fading the street.
- **The Scribing Hall was 20 m x 11 m,** as large as the plaza it stands beside, and filled
  the bottom third of the opening shot. Now 13 m x 7 m with a lower roof: it stands _on_ its
  terrace rather than filling it.

**A wrong turn worth recording.** The roof filling the lower third looked like an occlusion
bug, and the fade was built to solve it. It was not: under an orthographic camera the segment
from the player to the camera passes roughly 16 m _above_ that roof, so nothing was actually
being hidden. The mass in frame was just an oversized building seen from behind. The fade is
still correct and still earns its place the moment the player walks north of the hall, but the
composition fix was the prop size. **Diagnose with a colour probe, not by reasoning about the
projection:** painting the roof magenta answered in one render what two changes had guessed at.

### 7. The T-pose bug (this commit)

The owner reported characters stuck in a T-pose. It was a real bug, not a missing clip.

`CharacterRig.pose()` expressed each bone rotation in the bone's local frame by reading the
**parent's current orientation** and converting through it. That is correct only while the
chain is in the pose the maths assumes. The animation mixer rewrites the entire chain whenever
an action clip plays, so on every frame after a clip had run, the procedural correction was
computed in the _clip's_ frame: the 73-degree rotation meant to bring T-posed arms down went
in the wrong direction and left them out sideways. Characters that never played a clip looked
fine, which is why only some figures were affected and why it looked intermittent.

The fix is to express the rotation entirely in the **bind** frame, captured once per bone at
build time and never recomputed: `local = parentBind⁻¹ · R · parentBind · bind`. The result now
depends only on the requested angles, so it is immune to whatever the mixer did a moment ago.

**The general lesson:** a procedural pose layer that runs alongside an animation mixer must not
read bone state the mixer owns. Treat the bind pose as the only stable frame of reference.

---

## Things learned the hard way

Also recorded in `docs/MISTAKES.md`.

- The cloud container **can** render real WebGL, contrary to the old handover note: the
  pre-installed `/opt/pw-browsers/chromium` with the ANGLE + SwiftShader flags works.
  `tools/scripts/screenshot-phone.mjs` does this. Never claim a build pass proves the world
  renders.
- **Playwright's clock control stops movement.** `page.clock.setFixedTime` and
  `clock.install` both freeze the locomotion loop, so the screenshot scripts use the real
  clock. The repo's own smoke test (`tools/smoke/world.spec.ts`) pins the clock and has
  **not been run on this branch** — see open items.
- Quaternius outfit glTFs are clothes with no head. Verify a rendered frame, not a mesh list.
- `gltf-transform`'s `animation.dispose()` leaves channels, samplers and keyframes in the
  buffer. Dispose channels and samplers explicitly, then prune.
- A merged glTF document carries a second buffer; a GLB may hold only one. Rebind every
  accessor before writing.
- The local gateway process dies when a shell session ends unless started with `setsid`.
- `serialisePlayerState` is a hand-written field list. A new `PlayerState` field added to the
  interface, the initial state and the reader still silently fails to persist until it is
  added there too. The equipment tests caught this; add a persistence assertion with any new
  field.

---

## State at the stopping point

`npm run verify` green: 479 tests across 56 files. Precache budget 2.9 MiB against a 3 MiB
ceiling. No merge to `main`.

### Open items, roughly by value

1. **The world still dwarfs its people,** though less than it did. The Scribing Hall is
   resized and the camera is at spec; the remaining offenders are the 11.6 m plaza medallion
   and the 8 m avenue spacing in `courtyard.ts`, which are layout rather than props and so
   move waypoints when changed. Do this deliberately, not as a tweak. This is the owner's one
   remaining visual complaint.
2. **Gear is one tier deep and melee only.** No head, legs, hands, feet, cape, neck, ring or
   ammo slots, because no gear exists for them. Magic and Ranged are unbuilt (§3.4.3), so
   there is no combat triangle yet.
3. **The smoke test is unrun on this branch** and its clock-pinning may fail per the note
   above. CI on the branch will say.
4. **The precache budget is nearly full.** A fourth outfit or another creature needs the
   budget re-examined, not just a harder decimation ratio.
5. Quest, diary and clue content still centres on the Courtyard; the three outer notice
   boards surface the same catalog.
