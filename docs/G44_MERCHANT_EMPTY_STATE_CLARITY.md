# G44 — merchant empty-state clarity

## Scope

Distinguish valid empty Quartermaster sections from missing or failed interface content.

## iPhone acceptance

1. Open Quartermaster Vell with an empty satchel and confirm `Nothing to sell` appears.
2. Open the panel without equipped gathering tools and confirm `No tools equipped` appears.
3. Reach a state with no remaining tool upgrades and confirm `No upgrades available` appears.
4. Confirm populated sections still show the same sell, repair, and upgrade controls.
5. With VoiceOver, navigate by region and confirm all three sections have useful labels.
6. Begin movement and confirm the merchant panel still closes under the global contextual UI rule.

## Boundaries

This adds local empty-state copy and accessible section labels only. It does not alter item
eligibility, prices, repairs, upgrades, inventory, persistence, progression, networking, server
runtime, social features, assets, or hosting.
