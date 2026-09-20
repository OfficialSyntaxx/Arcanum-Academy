# G45 — shared scenery decoder

## Scope

Remove the duplicate environment Draco loader so all runtime GLB decoding uses the established
lazy singleton and its one-worker mobile limit.

## iPhone acceptance

1. Load the Courtyard and confirm trees, rocks, and homes upgrade from procedural fallbacks.
2. Travel through forest, mountain, and snow regions and confirm their scenery still loads.
3. Move rapidly between regions while assets are loading; confirm late loads do not restore a
   disposed zone.
4. Disable the network after the shell loads and confirm procedural scenery remains playable when
   an environment model cannot be fetched.
5. Confirm player, NPC, Shore Wolf, and other combat models still load and animate.
6. In Safari Web Inspector, confirm zone changes do not create an additional Draco worker per
   environment build.

## Boundaries

This consolidates an internal client loader only. It does not change models, placement, collision,
navigation, combat, progression, persistence, networking, server runtime, social features, assets,
or hosting.
