# G28 — Elevation-following world paths

The procedural path renderer now draws every authored graph link, including links whose endpoints
have different terrain heights. Such links use one low-cost sloped strip that follows the real
route; the existing world graph remains the movement and collision authority.

## iPhone acceptance

1. Travel through Cinderhollow from Cavern Mouth toward Ember Gallery and Cindermark Fork.
2. Confirm route strips remain visible at terrace transitions rather than ending at a retaining
   edge.
3. Confirm normal tap-to-move, minimap routing, and context-panel dismissal remain unchanged.
