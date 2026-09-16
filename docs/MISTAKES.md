# Mistakes and preventative rules

## G1 — preview and asset boundaries

- The default branch still contains the old academy game. Locate the G0 branch before
  editing; do not reconstruct G0 from the default branch.
- An npm workspace wrapper needs the trailing `--` to forward preview host/port flags.
- The cloud browser's default Chromium reports `GL_RENDERER = Disabled`, but the
  pre-installed `/opt/pw-browsers/chromium` launched with the ANGLE + SwiftShader flags in
  `playwright.config.ts` renders real WebGL. `tools/scripts/screenshot-phone.mjs` does this;
  use it, and never present a build pass as proof that the world renders.
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

# G6-A rules learned

- Run lint after adding defensive rollback catches. An intentionally ignored rollback failure still
  needs a comment body; an empty `catch` violates the repository's lint gate.
- Snapshot insertion and live-save replacement must share one transaction. A snapshot written before
  a rejected version check is false history unless the surrounding transaction rolls it back.
- Restoration must move the live version forward and snapshot the displaced state first. Rewinding a
  version breaks optimistic concurrency; overwriting without a backup defeats the feature's purpose.

# G6-B rules learned

- A new server directory is a new architecture layer. Add its allowed dependency rule and document
  the boundary in the same change; otherwise the executable boundary check correctly rejects it.
- Never log raw admin URLs: search text and accidental query parameters are operator-controlled and
  can contain sensitive data. Log the matched route pattern and method instead.
- Escape SQL `LIKE` metacharacters for an ID search advertised as literal. Parameterization prevents
  injection, but it does not stop `%` and `_` from silently changing search semantics.

# G6-C rules learned

- A separate browser bundle still needs an explicit server-origin contract. Bearer authentication
  does not make wildcard CORS safe; allowlist the exact operations origins and conceal refusals.
- Client separation must be executable, not a folder naming convention. Check both player source and
  the built PWA for admin imports, route markers, labels, and server credential names.
- An admin read token is session material, not a preference. Never persist it, prefill it through a
  build variable, append it to a URL, or keep it after disconnect/navigation.

# G6-D rules learned

- A CSS minimum width is not mobile evidence. Long opaque identifiers are adversarial content and
  need explicit wrapping at the element that renders them.
- Operational analytics should answer bounded questions with aggregates. Do not collect event trails
  merely because a dashboard could chart them.
- Count rejected report attempts toward the rate limit. Schema validation is still server work and
  malformed spam must not receive an unlimited bypass.
- Support context must be selected and capped on the client, validated again on the server, and
  stripped of transport addresses before it reaches the operations console.
- Build from a clean output directory. TypeScript project-reference artefacts and obsolete hashed
  Vite chunks otherwise look like deployable PWA weight and can be accidentally precached.
- Type an admin read model from the actual server receipt. Empty production histories can conceal a
  mismatched timestamp or version field until the first real recovery event occurs.

# Claudesep16 rules learned

- Quaternius outfit glTFs are clothes only. A bare-headed outfit has no head until the base
  body's head, hair and eyes are cropped and merged in; check a rendered frame, not the mesh list.
- The free Universal Animation Library 2 sample has no plain idle or walk clip. Do not assume a
  clip exists from the pack's name; list the clips in the GLB first.
- `gltf-transform` `animation.dispose()` leaves the clip's channels, samplers and keyframes in
  the buffer. Dispose channels and samplers explicitly, then prune, or the GLB stays huge.
- A merged glTF document carries a second buffer; a GLB may hold only one. Rebind every
  accessor to the first buffer before writing.
