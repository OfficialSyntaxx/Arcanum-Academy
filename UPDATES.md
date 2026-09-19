# Updates — branch `Claudesep16`

Running log of what this branch changed, why, and where it stopped. Written for whoever
picks the work up next, human or agent. `AI_HANDOVER.md` remains the single source of truth
for the design; this file only records the state of this branch against it.

## G14 Cinderhollow first descent — Codex, 2026-09-19

- Reaching Cinderhollow Caverns for the first time now records the **Through the Cindermark**
  exploration discovery through the existing server-authoritative travel and Collection Log paths.
- It is idempotent and gives no coins, diary reward, item, combat advantage, asset, social surface,
  tracking, or hosting change.

## G13 mobile exploration clarity — Codex, 2026-09-19

- The compact in-world Journey tracker now names the authored destination of its next active
  objective, so a player can keep moving without opening another menu or relying on a map pin.
- Every quest objective carries concise location context, including Cinderhollow and the Crucible
  Chamber. This is presentation-only: rewards, combat, progression, persistence, assets, hosting,
  and social surfaces are unchanged.

## G11 guided Cinderhollow expedition — Codex, 2026-09-19

- Added **Heart of Cinderhollow** after The Foothill Forge and before The Long Winter.
- It guides mining, the Cinderbound Wisp, Cinderheart, and permanent Sigil proof; Brix supplies contextual guidance.
- Reuses existing mobile UI and adds no assets, hosting, trading, presence, or client-authoritative progression.

## G12 Cinderhollow exploration depth — Codex, 2026-09-19

- Extended the existing server-authoritative Tideglass Trail through a new clue site at
  Cinderhollow's central fork, giving the completed zone a hidden exploration beat.
- Reused the existing clue ledger, tracker, reward, and rendering path; no migration, new asset,
  extra reward, hosting change, or social surface was introduced.

**Branch:** `Claudesep16`, cut from `main` on 2026-09-16 and admitted to `main` as G7-B after
independent verification on 2026-09-18.
**Owner instruction on this branch:** never push to `main` without explicit approval.

## G10 Cinderhollow expansion — Codex, 2026-09-18

- Began the next single-player world/content phase after deciding paid multiplayer hosting is not
  useful before the game has players.
- Cinderhollow is a volcanic Cindermark branch that will turn the existing resonant-ingot and
  forged-gear progression into a new exploration, crafting, and solo combat route.
- Scope, constraints, and staged delivery are recorded in `docs/G10_CINDERHOLLOW_EXPANSION.md`.
- Completed G10-A and G10-B: the live route now leads into a Mining 8 Cinder Ore Vein, a
  non-aggressive combat-4 Cinderbound Wisp, and the Cinder Crucible. Three ore plus a wisp core
  temper into Cindersteel; three ingots and one solo-gathered Emberwood Plank create the
  Defence-10 Cindersteel Buckler (+23 defence).
- The loop is Ironman-safe: no shop material, trade, presence, or new server runtime is involved.
- Confirmed mining, Cinderbound Wisp defeat, and Cindersteel tempering each unlock a discovery;
  completing all three settles the existing 15-coin diary reward exactly once.
- Completed the Cinderheart finale: a non-aggressive level-10 boss in the Crucible Chamber, gated
  by one confirmed Cinderbound Wisp defeat and using the existing deterministic two-phase boss
  behavior. Its first defeat records a unique discovery, grants a non-tradeable Cinderheart Sigil,
  and completes the 15-coin Heart of the Hollow diary.
- Verified locally: 523 tests across 62 files, full production builds, a 2.60 MiB PWA budget, and
  admin isolation.

## G9 live-presence gate — Codex, 2026-09-18

- Kept the project on free hosting and left live presence and trading disabled.
- Separated private self-position reporting, needed for authoritative range checks, from returning
  other players' location data. The default presence response now contains no neighbours.
- Future enabled presence projects neighbours to ephemeral avatar IDs and render transforms only;
  it never exposes session or player identifiers.
- Added an explicit `LIVE_PRESENCE_ENABLED` configuration gate, regression coverage, and the
  paid-hosting cutover checklist in `docs/G9_LIVE_PRESENCE_GATE.md`.

## G8-D public profile links — Codex, 2026-09-18

- Added a same-origin, opaque-ID profile link and native mobile share control for selected public
  profiles.
- Opening a link loads its public comparison; closing it removes the parameter. The server remains
  the sole authority for whether that opaque value resolves to a currently opted-in profile.
- Added link validation coverage and iPhone acceptance steps in
  `docs/G8_D_PUBLIC_PROFILE_LINKS.md`.

## G8-C public profile comparison — Codex, 2026-09-18

- Added a local, side-by-side comparison for an opted-in public profile and the player's confirmed
  own progression: totals, discoveries, diary milestones, and all authored skills.
- The client derives its side locally from its existing authoritative projection; it submits no
  comparison data and introduces no social write or tracking surface.
- Added focused comparison coverage and iPhone acceptance steps in
  `docs/G8_C_PROFILE_COMPARISON.md`.

## G8-B public profile detail — Codex, 2026-09-18

- Added an opaque, opt-in public profile address, never derived from the internal player ID.
- Hiscores entries now open public skill detail, discovery totals, and paid-diary highlights.
- Kept display names non-unique, private state excluded, and the feature read-only.
- Verified locally: 514 tests across 60 files, production builds, asset budget, and admin isolation.

## G8-A public profiles — Codex, 2026-09-18

- Added an opt-in in-game Profile tab for a player-selected display name and public listing.
- Added a read-only top-25 hiscores endpoint. It derives total level, total XP, and combat level
  from authoritative saved progress; the client cannot submit a score or player ID.
- Profiles are private by default and never expose inventory, bank, equipment, location, quest
  state, recovery linkage, or operations data.
- Added privacy-focused regression coverage and phone acceptance steps in
  `docs/G8_A_PUBLIC_PROFILES.md`.

Verified locally: 514 tests across 60 files, production builds, asset budget, and admin isolation.

## G7-A account recovery — Codex, 2026-09-18

Implemented the identity gate that remained after G7-B admission:

- opt-in player signup, sign-in, password reset, character protection and clean-device recovery;
- a same-origin Netlify Function that authenticates the player and sends only the stable Netlify
  subject to Render through a server-only bridge secret;
- durable one-to-one external-account mapping with atomic Alderfell bearer rotation;
- generic error responses, concealed unconfigured routes, rate limiting, and no browser-bundled
  server URL or secret;
- mobile account UI behind the existing compact connection strip;
- deployment and two-browser acceptance instructions in
  `docs/G7_A_ACCOUNT_RECOVERY_HANDOVER.md`.

Verified locally: 512 tests across 59 files, typecheck, formatting, lint, architecture boundaries,
admin isolation, production builds, and client asset budget. Production configuration and the
two-browser recovery acceptance remain operator steps.

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

`npm run verify` green at admission: **506 tests across 57 files**. The Playwright smoke suite was
previously green with **5 passed in 43 seconds**; the admission runner could not repeat it because no
Chromium executable was installed. Production build, asset budget and admin isolation passed.
Production precache at admission is **2.57 MiB against a 3 MiB ceiling**.

### Three real bugs the smoke suite finally surfaced

The two long-failing smoke tests were not flaky and not slow rendering. Chasing them down found
three genuine defects, each of which would bite a real phone:

1. **Presence was published on a 250 ms throttle, but interaction commands were sent the instant
   the player arrived.** The server validates range against the last position it was told about,
   so the first attacks were refused with `combat.out_of_range` - and `autoAttackRetries < 4`
   meant four such misses disabled the fight _permanently_. The controller now syncs presence on
   the same ordered connection immediately before engaging, so the range check sees where the
   player actually is. A stuttering phone hit this exactly as the test did.
2. **Automatic combat paced its next attack from a server timestamp compared against the client's
   own `Date.now()`.** With any clock skew where the client trails the server, `now >= pacedFrom +
tickMs` is never true and the entire exchange freezes with both sides at full health, forever.
   Pacing now runs from the local time the strike receipt arrived; the server still refuses
   anything early with `combat.cooldown`, which the existing retry answers.
3. **The smoke tests froze the world they were testing.** `page.clock.setFixedTime` replaces the
   `requestAnimationFrame` timestamp, not just `Date`, and the engine derives its frame delta from
   that timestamp - so the player never moved at all. The same walk completes in 10.5 s with no
   clock control. `install` + `resume` is no better. The pin bought nothing anyway: the in-game
   hour comes from the sim clock, not wall time. All clock control is gone from the suite.

### Draw-call and download budgets

- **Crowd LOD.** Rigging all 18 crowd members put the Courtyard near 190 draw calls against the
  §6.8.1 target of 100. Crowd rigs are now pooled two per outfit and follow the nearest matching
  students, while the named cast stays always-rigged; roughly 80 draw calls, and the measured
  frame rate went from 3.4 fps to 5.2 fps under software rendering.
- **Draco for characters closed open item 4.** The environment models were already Draco-
  compressed, so the phone downloads the decoder either way - compressing the characters with it
  too was pure saving. The character set went from ~1.44 MB to 634 KB and the precache from
  3150 KiB (_over_ the 3072 KiB ceiling, which was failing the build) to 2248 KiB. Both character
  loaders now share one Draco-enabled `GLTFLoader` in the new `assets` layer.

### What the phone screenshot found

Screenshotting the built game instead of reasoning about it caught three things the
numbers had not:

- **Most of the crowd rendered as featureless capsules.** Two causes stacked. The crowd rig
  pool was fixed at two per outfit, a trade made against a draw-call figure measured under
  SwiftShader - which says nothing about a phone GPU, and 190 calls was under the §6.8.1
  ceiling of 200 anyway, missing only the target of 100. Underneath that, **both peasant
  outfits were failing to load entirely**: Draco corrupts the skin of any glTF assembled by
  merging a second document, which is how `attachHead` builds a peasant. The pool is now sized
  from the device tier and the real roster; Draco applies only where it is safe.
- **`CharacterRig` swallowed the load failure**, so a corrupt asset looked like a deliberate
  art choice with nothing in the console. It logs now. This is why the above hid for a build
  cycle.
- **The Scribing Hall roof filled the bottom third of the screen.** The occlusion fade never
  fired because the camera-to-player segment passes above the roof: not blocking the player
  and not eating the frame are different questions. Anything nearer the camera than the player
  now fades too.

The plaza medallion went from 11.6 m to 6.8 m and the Courtyard crowd from 18 to 14.

### Content added after that

- **Eight equipment slots** (Head, Cape, Hands, Legs, Feet joined Weapon, Body, Shield) and two
  full armour sets: Emberwood from planks at low level, Resonant from ingots at the forge,
  plus a Tideglass Cape. Every piece has a recipe at an authored station.
- **Rolled rare drops.** Every drop was guaranteed, so no creature was worth killing twice.
  `rareDrops` rolls server-side from the killing blow's own seed, so the outcome is fixed when
  the creature falls and cannot be re-rolled by replaying it. Warden 1/24 cape, Sentinel 1/12
  ingot, ridge and frost packs 1/16 crystal.
- **Ranged as a fourth combat style**, with its own skill and an Emberwood Shortbow strung at
  the timber saw. One level supplies both accuracy and maximum hit, as in OSRS, and the style is
  refused without a bow equipped so it is a choice of kit rather than a free extra stance.
- **Magic as a fifth style, and the combat triangle itself.** A Magic skill and a Resonant
  Staff socketed at the timber saw, gated on the staff exactly as Ranged is on a bow (a bow is
  explicitly not accepted as a staff). Creatures now carry an optional `weakTo`, and matching
  it is worth `TRIANGLE_ADVANTAGE` (6) effective levels of **accuracy only** - the damage roll
  is untouched, so a good matchup lands more often rather than hitting harder, and a bad one is
  slower rather than hopeless. Wisps are weak to Ranged, wolf packs to Magic, the Sentinel to
  Aggressive and the Warden to Magic.
- **Ammunition, so the kit styles have an ongoing cost.** A bow spends an Emberwood Arrow and a
  staff burns a mote of resonant dust, every swing, hit or miss - a cost that applied only to
  swings that landed would make accuracy free and quietly reward missing. Arrows are fletched
  fifteen at a time at the timber saw; dust was already a Refining product, so Magic gives that
  recipe its first customer. Melee stays free, which is what makes it the floor. Running dry
  drops the client back to melee with a line in the log rather than silently stalling an
  automatic fight.
- **The Tideglass Trail now crosses the world.** It ran four steps, three of them inside the
  Courtyard; it now runs seven, out through the Reach, the Ridge and the Frostgate before the
  last bearing points home. Extending it uncovered a **silent data-loss bug**: the save reader
  clamped trail progress with a literal `Math.min(4, ...)` left over from the four-step trail,
  so every step past the fourth was accepted by the handler, written, and clamped away on read -
  no error anywhere, the player simply sent back to a bearing they had already inspected. The
  clamp now follows the authored trail.
- **A weakness on every creature**, so the stance always matters. Shore Wolf and Emberwood
  Wolves answer to melee, since both are fought long before a bow or staff is realistic; the
  armabees and wisps want Ranged; the wolf packs and the Warden want Magic; the Sentinel wants
  Aggressive. The Shore Wolf's weakness is deliberately **not** Accurate: that is the default
  stance, so a weakness to it would be granted automatically and felt by nobody. The first
  creature teaches the mechanic by making the player change something.
- **The weakness is shown on the stance itself.** The effective stance gets a green edge and a
  glyph in the combat HUD, on a different channel from the amber selected state, so a stance
  that is both reads as both. Verified on a phone screenshot rather than assumed. A mechanic
  the player cannot see is not a mechanic, and naming it only in prose would not survive the
  half-second the player has to act on it.
- **Three quests extending the chain into the outer zones** (The Reach Pack, The Foothill
  Forge, The Long Winter), each ending further from the plaza than the last.

All gear bonuses and drop rates are **conservative placeholders and the owner's to revise**.

### G1 criterion 2: the smoke suite could not fail

§13.1 requires the smoke suite to have been **shown to fail when the world is blanked** - "a
check nobody has seen fail is a check nobody should trust". Nobody had ever run that mutation.
It was run, and **the suite passed with every piece of scenery stripped out of the zone.**

The reason: the world check was the renderer's own totals, `data-render-calls > 5` and
`data-render-triangles > 100`. Those totals cannot distinguish a dressed zone from an empty one,
because characters and the HUD dominate them. Measured:

|                    | draw calls | triangles   |
| ------------------ | ---------- | ----------- |
| Dressed zone       | 236        | 214,392     |
| **Blanked zone**   | **201**    | **189,025** |
| Threshold asserted | > 5        | > 100       |

The check now reads `data-world-meshes`, published from `WorldService.drawnMeshCount`, which
counts the drawables under the zone group alone. Re-running the mutation makes it report **0
against an expected > 20 and fail on all three viewports**, so the check has now been seen to
fail. The totals are kept as a cheap "did WebGL submit anything at all" signal.

**`npm run smoke:mutation` makes that proof repeatable** rather than a claim in a commit
message. It blanks the geometry, rebuilds, runs the suite and succeeds only if the suite fails -
a green suite under mutation exits non-zero, because it means the check has stopped being able
to detect a missing world. Restoring includes rebuilding the client, since putting the source
back while `dist` still holds the blanked bundle would leave a later smoke run failing for a
reason no longer in the tree. It refuses to start against a dirty `scene-builder.ts`, because it
restores by overwriting.

**That measurement found a real budget breach, since fixed.** The Courtyard was at **236 draw
calls against the §6.8.1 ceiling of 200**, and 201 with the world blanked - the characters alone
were at the ceiling. Quaternius ships an outfit as a node per garment, so a ranger was ten draw
calls for two materials. The build now merges each character's primitives by material:

|                   | draw calls                 | triangles |
| ----------------- | -------------------------- | --------- |
| Before            | 236 (over the 200 ceiling) | 214,392   |
| **After merging** | **162**                    | 214,372   |

Same geometry, 74 fewer draw calls, and the character GLBs got slightly smaller too. `join()`
will not do this because it skips skinned meshes - merging across different node transforms
would break the skin - so the merge checks that every mesh node sits at identity and shares one
skin, and skips itself entirely if that ever stops being true.

### Security review

A security pass over the whole branch found **no exploitable vulnerability**. The paths that
matter were traced and are sound: `equip` removes before it returns a displaced piece and does
both inside one transactional update, so a partial application cannot mint an item; the target
slot comes from the catalog rather than the payload; the catalogs are `Map`-backed, so a crafted
item id cannot reach an inherited object; rare drops are rolled server-side from the killing
blow's seed and the roll is spent whether or not the prize fits, so a deliberately full satchel
cannot re-roll a result.

One robustness wart was hardened rather than left: `unequip` indexed `state.equipment` with the
caller's string, and `__proto__` resolves to `Object.prototype`, which is not `undefined` and so
walked past the existence check. Nothing was grantable through it - `addItems` rejected the
undefined id a step later - but that is a _distant function's_ behaviour holding it safe rather
than the handler's own. The slot is now checked against `EquipmentSlot`.

Noted, not a finding: interaction range is validated against the position the client last
reported, so a modified client can misreport where it stands. That predates this branch and is
already documented as an accepted trust gap for single-player Ironman; `syncPresence()` changed
when that value is sent, not who controls it.

### Review findings, fixed

A review pass over the whole branch caught three defects I had introduced and self-reviewed past:

- **The crowd rig budget was applied per outfit, not as a total**, so two outfits could build
  twice the device tier's cap between them - the exact draw-call blowout the cap exists to
  prevent. Now a shared remaining budget.
- **A rare drop into a full satchel vanished in silence** while the comment beside it claimed
  the player was told. Rares are now paid _before_ the guaranteed drops, because a 1/24 cape and
  a scrap of meat competing for the last slot should not resolve in the meat's favour, and one
  that still will not fit is reported in `missedDrops` - a prize lost without a word is
  indistinguishable from bad luck.
- **The out-of-ammo fallback fired every frame.** `lastCommandError` latches until the next
  command resolves, so the "say so once" comment was wrong: it flooded the log and overwrote any
  stance the player re-selected. Now keyed on the error and answered once.

### A note on the smoke suite

The walk test intermittently exceeds its budget when the whole suite runs in one worker, while
passing in isolation in about 19 seconds every time. It is software rendering under sequential
load, not a regression - but it has now been raised from 30s to 60s once, and raising it again
would be papering over it. If it keeps recurring, give it its own worker rather than a bigger
number.

### Open items, roughly by value

1. **`DEFENSIVE` is never a weakness.** Every other style answers something; a creature "weak
   to being blocked" did not read as a real idea. Harmless, but the shape is asymmetric.
2. **The sea reads as one flat slab meeting the land on a hard line.** Two attempts at a
   shallow-water band were made and both **reverted**. What is now established, by colour probe
   from the shore rather than by argument:

   - The large flat expanse filling the upper screen from the southern shore **is** the sea
     slab. (An earlier note here said it was not; that was wrong, and the error was probing
     from the plaza and comparing against a screenshot taken at the shore. From the plaza the
     sea is a distant strip; from the shore it fills the view. Same geometry, different
     vantage point.)
   - `rotation.x = Math.PI / 2` turns a `ShapeGeometry`'s normal to **-Y**, i.e. face down.
     The coastal apron carries that sign, so **the apron has never been visible** as shipped,
     and what reads as "the coast" is the sea slab behind it.
   - Flipping the apron to `-Math.PI / 2` does make it render, and it then replaces that whole
     expanse with flat dark green (`coastland`, 0x294f35). That is a real change to the
     established look, not a bug fix, which is why it was not kept.

   So the coast pass is an **art decision, not a defect**: either the apron is meant to be
   invisible and the sea is the coast, or the apron should show and wants a palette of its own.
   That call is the owner's; the mechanics above are settled and need no further probing.

3. **The plaza is still an empty 16 m square** (waypoints at ±8 m). Shrinking it would do more
   for character scale than anything left, but it moves waypoints and changes how the hub feels
   to cross, so it was left as an owner decision rather than a tweak.
4. **Diary rewards are all 15 coins**, including the outer-zone ones: paying more the further
   out a diary sends you is a reasonable idea and an **owner** decision, so the new entries match
   the approved figure rather than setting their own. The Tideglass Trail's 45 coins is likewise
   unchanged now that it is seven steps instead of four - also an owner call.
5. **No Neck, Ring or Ammo slots**, because nothing would fill them. Ammunition is spent from
   the satchel rather than a worn slot, which is a deliberate simplification: a stack inside an
   equipment slot is a real system, not a field.
6. **Draw calls are 162 against a target of 100** (ceiling 200). Under budget, but not at the
   target. The remaining lever is the environment and HUD rather than the characters.
7. **Still no evidence from a real iPhone.** G1 cannot pass on headless screenshots. The owner
   has said Codex will take the device checks.
