# G41 — constrained-height map escape

## Scope

Keep the local map's exit available when destination content exceeds the usable viewport height.

## iPhone acceptance

1. Open the local map in landscape with a viewport height at or below 500 CSS pixels.
2. Scroll the destination list to its end and confirm the title and Close control remain visible.
3. Confirm Close remains at least 48 by 48 CSS pixels and dismisses the modal with one tap.
4. Repeat in portrait at 150% in-game text scale and confirm the sticky header does not cover the
   region name, map canvas, legend, or first destination.
5. Confirm swipe scrolling continues to work from the map canvas and destination list.
6. Confirm the device safe areas and browser bars do not place the header outside the dialog.

## Boundaries

This is a local CSS accessibility and layout change only. It does not alter map data, routes,
movement, interaction, persistence, progression, networking, assets, server runtime, social
features, or hosting.
