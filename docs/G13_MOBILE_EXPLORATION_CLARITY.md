# G13 — Mobile exploration clarity

## Player outcome

The persistent Journey tracker now pairs the next active objective with a short, authored
in-world destination. On a phone, a player can glance at `Journey · Cinderhollow` above
`Mine 6 Cinder Ore` and keep exploring without opening the journal or following a new map marker.

## Scope

- Every quest objective now has concise destination context.
- The tracker displays it only for the current incomplete active objective.
- A ready-to-turn-in quest keeps the existing return-to-board instruction.
- Tapping the tracker continues to open the existing Quest Journal.

## Explicit non-changes

No rewards, quest requirements, combat numbers, drops, assets, server handlers, persistence,
hosting, tracking, social writes, or player data were changed.

## Regression coverage

Shared quest catalog tests require every shipped objective to have a non-empty destination and
lock the authored Heart of Cinderhollow destinations to Cinderhollow and the Crucible Chamber.

## iPhone acceptance

1. Accept **Heart of Cinderhollow** and return to the hub.
2. Confirm the compact tracker reads `Journey · Cinderhollow` and `Mine 6 Cinder Ore` without
   obscuring the movement stick or action prompt.
3. Mine six ore; confirm it advances to `Journey · Cinderhollow` for the Cinderbound Wisp.
4. Defeat it; confirm the destination changes to `Journey · Crucible Chamber` for Cinderheart.
5. Tap the tracker and confirm it opens the existing journal; close it and verify normal movement
   and the context action still work.
