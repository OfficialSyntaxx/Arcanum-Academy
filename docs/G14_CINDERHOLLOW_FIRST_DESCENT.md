# G14 — Cinderhollow first descent

## Player outcome

The first descent from the Cindermark Heights into Cinderhollow Caverns records **Through the
Cindermark** in the existing Collection Log. The volcanic branch now acknowledges exploration at
the moment a player reaches it, before asking them to mine, fight, or craft there.

## Authority and safety

- The existing `world.travel` handler records the milestone only after its normal route gate
  accepts travel from the Cindermark Heights.
- The existing idempotent discovery function means re-entering the caverns cannot duplicate it.
- The discovery is deliberately not part of any diary, so it creates no coins or new reward.
- No location is exposed to other players; the confirmed state remains private player progression.

## Regression coverage

- The discovery catalog test requires the authored entry and event mapping.
- The dungeon route test confirms the valid descent records it once and repeated entries stay
  idempotent.

## iPhone acceptance

1. Travel from the Cindermark Heights through **Descent to Cinderhollow**.
2. Open the existing Collection Log and confirm **Through the Cindermark** is recorded under
   Dungeon discoveries.
3. Return to the heights and descend again; confirm no duplicate entry, coin change, popup, or
   UI interruption occurs.
