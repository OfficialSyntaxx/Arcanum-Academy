# G8-B — public profile detail and comparison

G8-B extends opted-in hiscores with an opaque public profile address, skill breakdown, discovery
count, and completed-diary highlights. Display names remain non-unique by design; the opaque public
ID is generated only when a player opts in and is never the internal player ID.

The in-game Profile tab opens each listed character's public detail so players can compare levels,
XP, discoveries, and diary milestones side by side with their own confirmed state. This is read-only
social context, not presence, messaging, grouping, trading, or a way to inspect private saves.

## Privacy contract

Public detail contains only the opt-in name, opaque public ID, derived level/XP totals, skill
breakdown, discovery count, and completed diary titles. It must never return player IDs, account
data, email, identity subject, recovery status, inventory, bank, equipment, coins, location, quest
state, combat target, or gravestone.
