# Mistakes and preventative rules

## G1 — preview and asset boundaries

- The default branch still contains the old academy game. Locate the G0 branch before
  editing; do not reconstruct G0 from the default branch.
- An npm workspace wrapper needs the trailing `--` to forward preview host/port flags.
- This session's cloud browser reports `GL_RENDERER = Disabled`; WebGL rendering cannot
  be verified there. Never present a build pass as proof that the world renders.
- Decoration must not participate in ground raycasts. Ground picking must select terrain
  explicitly rather than choosing any triangle below a magic height.
- Keep model texture atlases intact; all three imported assets contain 512px WebP atlases.

# G5-E rules learned

- A second zone cannot reuse coordinate-only interaction validation. Persist the authoritative
  zone and require it before resolving dungeon combat or recovery.
- A gravestone position without a zone is ambiguous. Every durable world-space recovery record
  must include its zone and reject cross-zone retrieval.
- Public Google Drive source packs can hit shared quota even when their license is valid. Prefer
  creator-linked Poly Pizza model endpoints for reproducible GLB admission and record both URLs.
- Use `npm run asset-budget` (or the production `npm run build`, which includes it); do not assume
  a convenience script named `check:assets` exists.

# G5-F rules learned

- An interactable can be inside the server's range but still fail authored-world geometry rules.
  Check the distance from its approach waypoint immediately after placement, not only command range.
- Persist both the current clue index and a final reward receipt. A completed index alone does not
  prove whether an interrupted settlement paid, while a receipt makes retries unambiguous.
- A trail marker is a hint, not authority. The server must validate prerequisite, order, zone,
  latest presence, and range independently of what the client displays.
