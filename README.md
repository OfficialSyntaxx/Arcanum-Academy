# Alderfell

> _You wash up on the coast of a fallen realm with nothing, and you climb — through its
> forests, its ruins and its guilds — until the realm knows your name._

A **mobile-first, browser-based fantasy RPG** built on OSRS's design philosophy: everything you
own, you gathered, made, or killed something for. Deep skill progression, tick-based combat you
read rather than react to, a hand-built world you walk through, and a grind that is the point
rather than an obstacle.

It installs to an iPhone home screen as a PWA. **There is no App Store submission, ever.**

## What it is

|                 |                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------- |
| **Look**        | Low-poly 3D under an orthographic camera — free yaw, constrained pitch. Warm, cosy, PG.         |
| **Controls**    | Tap to walk, drag to rotate, pinch to zoom, long press for a context menu. No virtual joystick. |
| **Mode**        | Ironman. No trading, no purchased power, no offline progression.                                |
| **Combat**      | Melee / Ranged / Magic over a 600 ms tick. Magic is staves and crafted runes.                   |
| **Skills**      | 14 at launch — gathering, artisan and combat.                                                   |
| **Multiplayer** | Built, tested and switched off. Single-player first; see the handover.                          |
| **Cost to run** | £0. Netlify, Render free tier, Blender headless in CI.                                          |

## Start here

**[`AI_HANDOVER.md`](AI_HANDOVER.md)** is the single source of truth: the full vision, every
feature, the 30 settled decisions and why each was made, the roadmap gates, and a list of traps
that have already cost real time. Read it before writing code. `CLAUDE.md` is a short operating
summary that points at it.

## Develop

```bash
npm install
npm run verify      # format + lint + boundaries + typecheck + test
npm run dev         # Vite dev server (client)
npm run dev:server  # the gateway
```

`npm run verify` is the gate. Run it before every commit.

**362 tests across 30 files.** The architecture linter (`npm run boundaries`) fails CI when a
package imports across a layer it shouldn't — including type-only imports, because
`import type` compiles away and would otherwise let a rule leak with no runtime trace.

## Layout

```
packages/shared/   ids, Result, RNG, tunables, protocol, content catalogs, world data
packages/sim/      the deterministic kernel — nav, locomotion, economy, NPCs
packages/server/   gateway, sessions, identity, persistence
packages/client/   three.js renderer, React overlays, input, PWA shell
```

Dependency direction: `shared` → nothing, `sim` → shared, `server`/`client` → shared + sim.

## History

This repository was **The Arcanum Academy**, a card game. That game was cut on 2026-09-09; its
architecture, server and world systems became Alderfell. Three sibling repositories —
`isorpg`, `oakenfall` and `arcane-legends-academy` — are frozen and serve as quarries for
systems, art pipeline and content data respectively. `AI_HANDOVER.md` §11 says what to take
from each, and what to leave.
