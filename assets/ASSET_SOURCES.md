# Third-party asset inventory

This directory contains only assets in glTF 2.0 (`.gltf` plus its required
`.bin`/texture dependencies) or GLB (`.glb`) form. No Unity projects or
Unity-specific files have been retained.

## Downloaded content

| Directory | Content | Format | Licence | Verified source |
| --- | --- | --- | --- | --- |
| `quaternius/modular-character-outfits-fantasy` | Modular fantasy clothing and armour | 24 glTF models | CC0 1.0 | https://quaternius.com/packs/modularcharacteroutfitsfantasy.html |
| `quaternius/universal-base-characters` | Rigged base bodies | 2 glTF models | CC0 1.0 | https://quaternius.com/packs/universalbasecharacters.html |
| `quaternius/universal-animation-library-2` | Humanoid animation library | 3 GLB models | CC0 1.0 | https://quaternius.com/packs/universalanimationlibrary2.html |
| `quaternius/stylized-nature-megakit` | Trees, rocks, grass, plants, and scenery | 68 glTF models | CC0 1.0 | https://quaternius.com/packs/stylizednaturemegakit.html |
| `quaternius/fantasy-props-megakit` | Tools, weapons, stalls, furniture, chests, and props | 94 glTF models | CC0 1.0 | https://quaternius.com/packs/fantasypropsmegakit.html |
| `quaternius/medieval-village-megakit` | Buildings, roofs, walls, doors, and stairs | 176 glTF models | CC0 1.0 | https://quaternius.com/packs/medievalvillagemegakit.html |
| `kenney/mini-forest` | Forest scenery, archer, and equipment | 22 GLB models | CC0 1.0 | https://kenney.nl/assets/mini-forest |
| `kenney/mini-dungeon` | Dungeon environment and props | 30 GLB models | CC0 1.0 | https://kenney.nl/assets/mini-dungeon |
| `kenney/modular-cave-kit` | Cave environment components | 40 GLB models | CC0 1.0 | https://kenney.nl/assets/modular-cave-kit |
| `poly-pizza` | Zebra Clown Fish and Armabee Evolved, selected individually as animated models | 2 GLB models | CC0 1.0 | https://poly.pizza/m/6jO6q4uCdh and https://poly.pizza/m/GcttdvsqsQ |

## Sources intentionally not downloaded

- The provided itch.io page is an audio catalogue, so it contains no requested
  glTF/GLB assets.
- Poly Haven's texture/HDRI catalogues are CC0 but are image/environment assets,
  not glTF/GLB models. Its model catalogue is intentionally left for per-model
  selection so that large, unrelated assets are not bulk-added.
- OpenGameArt is a curated collection rather than one asset. Its entries have
  different source formats, so no entry was added without a separate glTF/GLB
  and licence check.
- Reddit links are discovery sources only and do not themselves supply assets.
  Any recommended asset must have its own download page and licence verified
  before addition.

The Quaternius standard archives were downloaded from their linked itch.io
pages. They were used only as a transport mechanism; the archives and all
non-glTF/GLB engine/source formats are not kept in this repository.

## Migrated project assets

`public/assets` was migrated from
[`OfficialSyntaxx/arcane-legends-academy`](https://github.com/OfficialSyntaxx/arcane-legends-academy),
commit `3edfde7af1f0a5bf6e378fc0ec2fff22d16258ae`. It contains 86 GLB
files (maps, buildings, creatures, and characters) and 59 project images.
The source repository did not include per-file licence metadata, so these
files must not be treated as independently verified third-party CC0 content.
