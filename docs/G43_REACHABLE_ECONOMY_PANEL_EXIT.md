# G43 — reachable economy-panel exit

## Scope

Keep the explicit Close action reachable while bank or merchant content scrolls beyond the panel.

## iPhone acceptance

1. Open the bank with enough satchel and stored stacks to make the panel scroll.
2. Scroll through both sections and confirm Close remains pinned to the panel's lower edge.
3. Repeat at 150% in-game text scale and in landscape at or below 500 CSS pixels high.
4. Open the merchant with sellable stacks, repairable tools, and upgrades; repeat the scroll check.
5. Confirm Close remains at least 48px high and dismisses either panel with one tap.
6. Begin movement from either panel and confirm the established contextual auto-close still works.

## Boundaries

This is a local CSS positioning change on the existing bank and merchant Close actions. It does not
alter transfer, pricing, repair, upgrade, inventory, persistence, progression, networking, server
runtime, social, asset, or hosting behavior.
