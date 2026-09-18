# G10 — Cinderhollow expansion

## Objective

Extend the single-player Ironman world with **Cinderhollow**, a volcanic cavern beyond the
Cindermark Heights. It is an authored late-game branch, not a multiplayer feature: exploration,
gathering, crafting, combat, and rewards remain server-authoritative and solo-obtainable.

## Why this is the next zone

The current route already teaches the progression that Cinderhollow can pay off:

1. The Courtyard teaches gathering and crafting.
2. Emberwood introduces stronger materials and the first gentle Shore Wolf hunt.
3. Cindermark introduces resonant ingots and the first forged combat equipment.
4. Frostgate and Saltwake establish regional fights and a dungeon finale.

Cinderhollow uses that established resonant-equipment tier as an entry expectation, creating a
clear reason to explore beyond the current world rather than another disconnected menu activity.

## Player journey

- A visible lava-lit cave mouth off the Cindermark route reads as a landmark from a distance.
- The outer cavern offers a new mining/gathering loop and a short, readable route to the forge
  chamber.
- Hostile cave creatures are a deliberate step above the Emberwood and ridge wolves; the Shore
  Wolf remains the low-risk first kill and is not retuned.
- The forge chamber provides a crafted upgrade path and leads to one compact boss encounter.
- A completed first-clear discovery feeds the existing collection-log and diary architecture.

## Non-negotiable constraints

- Mobile-first: use the curated CC0/Kenney cave assets already in the repository or procedural
  geometry; preserve the current PWA asset budget and avoid loading the entire asset library.
- Ironman: every required material and reward is solo-obtainable. Shops may not sell progression
  gear or materials.
- Context-bound panels close on travel or range loss. Persistent system screens remain available.
- Combat, rewards, discoveries, and quest advancement are confirmed by the server. No client-side
  reward prediction.
- Free hosting remains unchanged. No presence, messaging, grouping, trading, or other social
  writes are introduced by this expansion.

## Delivery slices

1. **G10-A — World route:** zone definition, portal, terrain palette, cave landmark, minimap and
   collision-safe traversal.
2. **G10-B — Solo loop:** complete — Mining 8 Cinder Ore Vein, combat-4 Cinderbound Wisp, Cinder
   Crucible recipes, the Ironman-only Cindersteel Buckler (Defence 10, +23 defence), and a
   discovery-backed 15-coin First Forge diary. The wisp is non-aggressive so the cavern remains
   explorable before the player is ready to farm its cores.
3. **G10-C — Cinderheart:** complete in code — a level-10, Magic-weak, two-phase Cinderheart boss
   in the Crucible Chamber. It unlocks after one Cinderbound Wisp defeat, awards the unique
   Cinderheart Sigil, and completes the 15-coin Heart of the Hollow diary. Real-phone acceptance
   remains a player-side check before calling the zone visually signed off.

Each slice must pass the full verification gate, production build, asset budget, and mobile
acceptance checks before the next one begins.
