# G34–G35 — Full-map navigation context

The local map now renders the existing in-memory player position/facing projection plus a fixed
north cue. These make the world-aligned full map and rotating minimap easier to reconcile without
adding controls, persistence, or network data.

## iPhone acceptance

1. Open a local map, move and turn, then reopen it; confirm the pale arrow updates.
2. Confirm north stays fixed on the local map while the minimap follows camera rotation.
3. Confirm selecting a destination still closes the panel and begins the normal local route.
