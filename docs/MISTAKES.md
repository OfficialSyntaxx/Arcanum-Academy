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

- A procedural pose layer must not read bone orientations the animation mixer owns. Express
  rotations in the bind frame, captured once. Reading the parent's _current_ orientation made
  characters snap to a T-pose on any frame after an action clip had played.

- Playwright's clock control replaces the `requestAnimationFrame` timestamp, not just `Date`.
  The engine derives its frame delta from that timestamp, so `page.clock.setFixedTime` froze
  the world: the player stood still forever and two smoke tests failed for months against what
  looked like slow software rendering. `install` + `resume` is no better. The in-game hour comes
  from the sim clock anyway, so the pin bought nothing.
- A client must not pace a repeated command from a _server_ timestamp compared against its own
  `Date.now()`. The two clocks are unrelated; when the client's trails the server's the whole
  automatic exchange stalls permanently. Pace from local receipt and let the server refuse
  anything early.
- An interaction command sent the instant the player arrives is judged against the last position
  the server was told about. Publish presence immediately before the command rather than relying
  on the movement throttle, or a slow frame puts the player out of range of something they are
  standing next to.
- Never swallow an asset load failure. `CharacterRig` caught its load error and fell back to a
  pooled silhouette, so a corrupt skin looked like a deliberate art choice: every peasant in the
  square rendered as a featureless capsule with nothing in the console. The catch now logs.
- Draco corrupts the skin of a glTF assembled by merging a second document (`attachHead`).
  three.js loads it and then dies on `matrixWorld` of undefined while cloning the skeleton.
  Compress the models that merge nothing; quantize the rest.
- A draw-call count measured under SwiftShader says nothing about a phone GPU. Trading visible
  character quality for an fps number from a software renderer was the wrong call, and 190 draw
  calls was under the 6.8.1 ceiling of 200 anyway - it only missed the target of 100.
- A sight-line test is not a "does it eat the frame" test. The Scribing Hall roof passed below the
  camera-to-player segment and still filled the bottom third of the phone screen. Fade whatever is
  nearer the camera than the player and close to the view axis, not only what the ray pierces.
- Probe from the same vantage point as the screenshot you are explaining. A magenta probe of the
  sea taken at the plaza, compared against a screenshot taken at the shore, "proved" the large
  blue expanse was not the sea. It was the sea. Same geometry, different camera position, wrong
  conclusion written into the handover.
- `rotation.x = Math.PI / 2` on a `ShapeGeometry` points its normal at -Y, face down. Positive is
  the intuitive sign and the wrong one. The coastal apron has carried it since it was written and
  has never actually been visible.
- A bound derived from content must be derived, not typed in. `readClueProgress` clamped trail
  progress with `Math.min(4, ...)` because the trail had four steps when it was written.
  Lengthening the trail then lost progress silently: the handler returned success, the write was
  clamped away on read, and nothing failed anywhere. Found only because a new step returned "ok"
  while the stored step did not move.
- A check that has never been seen to fail is not a check. The smoke suite asserted the world had
  rendered via the renderer's total draw calls and triangles; blanking the zone entirely moved
  those totals from 236/214k to 201/189k, far above the asserted 5/100, so a completely empty
  world passed. Assert on the thing under test - meshes in the zone group - not on a total that
  something else dominates.
