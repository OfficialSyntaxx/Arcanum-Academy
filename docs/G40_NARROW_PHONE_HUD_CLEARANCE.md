# G40 — narrow-phone top HUD clearance

## Scope

Keep the persistent Hub controls distinct at 320–360px without changing what the HUD exposes or
how any control behaves.

## iPhone acceptance

1. Open the Hub at a 320px CSS viewport width in portrait orientation.
2. Confirm the zone strip ends before the fold control and neither touches the minimap.
3. Confirm the fold control remains at least 48 by 48 CSS pixels and can hide and restore the HUD.
4. Confirm the 88px minimap remains legible, opens the local map, and shows player facing.
5. Start a journey and confirm its compact tracker stays clear of the minimap.
6. Repeat at 360px and with left/right safe-area insets; confirm no horizontal overflow.

## Boundaries

This is a responsive CSS change only. It does not alter camera framing, movement, interaction,
navigation data, persistence, progression, networking, assets, server runtime, social features, or
hosting.
