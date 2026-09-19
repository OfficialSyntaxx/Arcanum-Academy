# G29 — Elevation-aware minimaps

The rotating minimap now shares the local map's terrain-height rule: routes crossing a terrace
height are dashed. The rule lives in the client core rather than inside either UI component,
keeping every future map surface consistent with authored terrain.

## iPhone acceptance

1. Enter Cinderhollow and compare the minimap route around the cavern terraces with the local map.
2. Confirm climbed route segments are dashed in both places and normal route segments remain solid.
3. Confirm tapping the minimap still opens the local map and does not affect movement.
