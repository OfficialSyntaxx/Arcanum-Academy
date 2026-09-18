# G8-C — public profile comparison

G8-C completes the read-only comparison part of the public-profile loop. Selecting an opted-in
profile now places its public progress beside the player's already server-confirmed local progress.
It compares total level and XP, discoveries, paid diary milestones, and every authored skill.

## Data and privacy boundary

The comparison is derived in the game client from two existing projections:

- the selected profile's G8-B public response; and
- the player's current authoritative economy projection.

It introduces no request carrying the player's comparison data, no social write, no friend graph,
and no tracking. A public response remains limited to its opaque public ID, opted-in display name,
derived progress totals, skills, discovery count, and completed diary titles. Internal player IDs,
account/recovery state, inventory, bank, equipment, coins, location, quests, combat, and graves
remain excluded.

## Acceptance

Use two opted-in accounts. In Profile, open a hiscore entry and confirm the comparison shows both
accounts' totals and skill rows. Update progress on either account, refresh that profile, and
confirm only its public figures change. On a private account, confirm it never appears in the list
or provides a comparison target.
