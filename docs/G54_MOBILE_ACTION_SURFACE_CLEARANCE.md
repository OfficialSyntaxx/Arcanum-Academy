# G54 — Mobile action-surface clearance

The five game-panel tabs now occupy one fixed row at every supported phone width. A single
safe-area-aware CSS reserve describes the full distance from the viewport bottom to the top of that
row; contextual prompts and bottom combat/gathering surfaces position from the same value.

## Root cause

The tab bar declared four grid columns for five buttons. Profile wrapped onto a second row, but the
prompt still cleared only the intended one-row height. Because the navigation was rendered later and
had no explicit layer contract, it covered the prompt and won touch hit-testing.

## Regression evidence

The browser smoke suite walks to Resonance Seam once, then checks 320, 360, 390, and 430px portrait
viewports plus 844x390 landscape. At each size it verifies:

- all five tabs share one row;
- every tab remains at least 48px tall;
- the Mine action rectangle ends above the navigation rectangle;
- `elementFromPoint` at the action center resolves to the action button;
- a screenshot is attached to the run.

This is layout and presentation only. Interaction commands, movement, animation, combat, economy,
progression, persistence, and server authority are unchanged.
