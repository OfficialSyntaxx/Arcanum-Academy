# G7-B — admitted character, creature, combat and outer-world pass

The reviewed `Claudesep16` work is admitted as one coherent expansion because its visual pipeline,
combat rules, equipment, content and larger regions depend on each other.

- Reproducible CC0 Quaternius runtime pipeline with optimized player, NPC and creature GLBs.
- Shared humanoid rig, procedural locomotion, fixed T-pose blending, combat hitsplats and creature
  intent animations.
- Larger Emberwood, Cindermark and Frostgate regions with encounters, scenery, nodes, crafting loops,
  quests, diaries and the world-spanning Tideglass Trail.
- Automatic 600 ms OSRS-shaped combat, melee/ranged/magic styles, weaknesses, ammo/rune costs,
  equipment slots, crafted tiers and rolled rare drops.
- Phone-readable minimap, compact HUD, closer camera and building occlusion treatment.

Admission evidence on 2026-09-18: 506 tests across 57 files, production builds, 2.57 MiB PWA
precache, asset-budget pass and admin-isolation pass. The branch previously recorded five passing
Playwright smoke cases; this admission runner had no Chromium executable and therefore could not
repeat visual automation. Manual iPhone acceptance remains required.
