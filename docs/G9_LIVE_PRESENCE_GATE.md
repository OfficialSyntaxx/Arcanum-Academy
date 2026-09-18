# G9 — live presence gate

G9 begins after G8's read-only social features. Alderfell remains an Ironman game on free
hosting, so this release does **not** make players visible to one another or enable trading.

## Current safety boundary

Clients continue to send their own position because the server uses it for authoritative range
checks: gathering, combat, clues, and other context-bound actions must not trust a client-supplied
target range. With `LIVE_PRESENCE_ENABLED=false` (the default), the server returns an empty
neighbour list. No other player's position or session-derived identity is disclosed.

`MULTIPLAYER_ENABLED` remains separately disabled. It controls the pre-existing trading handlers
and must remain false while Ironman is the only playable mode.

## Cutover requirements

Only enable `LIVE_PRESENCE_ENABLED=true` after all of the following are true:

1. The production WebSocket service is always on; free-tier sleep and cold starts are not
   acceptable for a shared-world feature.
2. A two-device real-phone acceptance run verifies reconnect, leave/rejoin, radius culling, and
   no player identity or private save data in the presence payload.
3. The client has a reviewed, mobile-budgeted renderer for remote avatars. The current client
   intentionally ignores presence deltas, so enabling the server flag alone cannot accidentally
   ship a partial visible-presence experience.
4. Trading stays disabled. Standard mode, a deliberate account-mode decision, and the economy
   review belong to the later M-4 gate.

## Free-hosting acceptance

With the default configuration, connect two different accounts and send valid position reports.
Each account must receive `s:presence_delta` with an empty `neighbours` array while normal
range-gated actions continue to work. The gateway and configuration tests enforce this contract.
