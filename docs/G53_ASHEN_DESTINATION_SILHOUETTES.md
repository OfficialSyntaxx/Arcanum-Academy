# G53 — Ashen destination silhouettes

Each Ashen Overlook branch now has a distinct landmark visible from the crossroads:

- **Ember Vista:** a three-point basalt crown.
- **Glasswind Shelf:** four pale mineral fins in one instanced draw call.
- **Watcher's Crown:** a weathered stone arch facing the return route.

## Performance and gameplay boundary

The additions reuse existing procedural geometries and materials, add no asset download, and keep
repeated pieces instanced. Every object is scenery-only with raycasting disabled. There is no new
collision, interaction, reward, resource, encounter, persistence, or server runtime behavior.

## Evidence

A focused renderer regression constructs the low-quality Ashen scene and asserts that all three
named landmark groups are present before disposing the geometry.
