# G32 — Regional map contrast

Regional map styling now defines both paper and route colour in one client-core catalog. Both map
surfaces consume that pair, avoiding a future contrast regression when a new zone receives its own
palette.

## iPhone acceptance

1. Open the local map and minimap in Frostgate, Cinderhollow, and Ashen Overlook.
2. Confirm route lines remain visually distinct from each regional surface.
3. Confirm dashed elevation segments remain identifiable on top of the regional route colour.
