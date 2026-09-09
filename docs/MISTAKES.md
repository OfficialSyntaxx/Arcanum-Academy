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
