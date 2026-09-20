# G52 — Scenic map destinations

Waypoints explicitly tagged `destination` now appear beside actionable locations on the local map.
Selecting one closes the map and walks the player there through the existing navigation controller.
Nearby scenic destinations also appear as small amber points on the rotating minimap.

## Safety boundary

- A scenic selection calls only the local player route and starts no interaction.
- Unlabelled or merely decorative waypoints are excluded.
- Existing resource, crafting, clue, combat, quest, and portal destinations keep their normal flow.
- No network command, save field, reward, XP, item, encounter, or server behavior was added.

## Evidence

- Focused tests cover the explicit tag-and-label admission rule.
- The shared graph continues to validate every scenic destination as reachable from the zone spawn.
