# G16 — Tideglass clue wayfinding

## Player outcome

Every authored Tideglass clue site is now listed as a destination on the existing local map. In
Cinderhollow, a player can choose **Tideglass Brand** and follow the normal path to its approach
waypoint; inspecting it still requires the correct server-confirmed trail step and range.

The compact tracker now shows its total from the authored trail. With the Cinderhollow bearing,
the active sequence correctly reads up to **Clue 8 of 8** rather than a stale fixed total.

## Explicit non-changes

The route graph, interaction prompt, ordered server validation, persistence format, clue order,
reward amount (45 coins), assets, player power, tracking, social systems, and hosting are unchanged.

## Regression coverage

- Client tests require clue sites to remain map destinations.
- Client tests require the tracker count to derive from the shared authored trail.
- Existing shared and server clue tests continue to validate sites, positions, ordering, ranges,
  persistence, and the one-time reward.

## iPhone acceptance

1. Complete **Beneath the Saltline** and begin the Tideglass Trail.
2. At Cinderhollow's Tideglass Brand step, open the local map and confirm **Tideglass Brand** is in
   the destination list.
3. Select it and confirm normal path movement; at the site, use **Inspect** and confirm only the
   expected active clue advances.
4. Confirm the tracker displays the correct dynamic count, including **Clue 6 of 8** at the
   Cinderhollow bearing, without covering the movement controls.
