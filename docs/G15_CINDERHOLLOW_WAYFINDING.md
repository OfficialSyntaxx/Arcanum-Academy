# G15 — Cinderhollow wayfinding

## Player outcome

The existing local map now labels Cinderhollow's authored route landmarks directly on the path
diagram: **Cavern Mouth**, **Ember Gallery**, **Cindermark Fork**, **Ore Rim**, and **Crucible
Chamber**. Players can orient themselves before choosing an existing numbered destination.

## Scope

- Adds an optional player-facing label to shared world waypoints.
- Uses the labels only in the existing local-map SVG.
- Authors labels for all five Cinderhollow waypoints, matching the real navigation graph.
- Leaves map buttons, pathing, touch controls, and all interaction range checks unchanged.

## Explicit non-changes

No asset, reward, item, combat, progression, persistence, tracking, social, server runtime, or
hosting change is included.

## Regression coverage

The world catalog test locks the complete ordered set of Cinderhollow landmark labels while the
existing graph validation continues to prove the same route is valid.

## iPhone acceptance

1. Enter Cinderhollow and tap the minimap to open **Local map**.
2. Confirm the five labels are legible against the map surface in portrait orientation and do not
   overlap the numbered destination markers.
3. Tap **Cinder Crucible** from the existing destination list; confirm normal route movement,
   arrival, and contextual action behavior.
4. Rotate to landscape and confirm the compact map remains scrollable and the labels remain
   readable.
