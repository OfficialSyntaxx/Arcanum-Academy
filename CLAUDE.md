# Alderfell — project memory

> **`AI_HANDOVER.md` in this repository is the single source of truth.** Read it before
> touching anything. This file exists because Claude Code loads it automatically on startup;
> it is a pointer and a short operating summary, not a second specification.

## What this project is

**Alderfell** — a mobile-first, browser-based fantasy RPG built on OSRS's design philosophy.
You wash up on the coast of a fallen realm with nothing, and everything you own you gathered,
made, or killed something for. Installs to an iPhone home screen as a PWA. **No App Store.**

Low-poly 3D under an **orthographic** camera with free yaw and a constrained pitch. Warm, cosy
and PG in tone. Single-player Ironman at launch, with no trading and no offline progression.

**It is not a card game.** Spell cards, schools of magic, grading, slabs, deckbuilding and
card duels were cut on 2026-09-09 and deleted in G0. If you find yourself adding rarity to a
spell, or a loadout a player builds before a fight, stop: that is the cut game being rebuilt
under a new name.

## Where the answers are

| Question                                              | Where                               |
| ----------------------------------------------------- | ----------------------------------- |
| **Starting cold — install, run, verify**              | `AI_HANDOVER.md` §0.1               |
| **What already exists in the code**                   | `AI_HANDOVER.md` §0.2               |
| The game design document                              | `AI_HANDOVER.md` Part I (§1–§3, §7) |
| What is already decided (31 decisions)                | `AI_HANDOVER.md` §14.1              |
| **The gate you are on, in detail**                    | `AI_HANDOVER.md` §13.1              |
| Why not Unity                                         | `AI_HANDOVER.md` §4.2               |
| Architecture and the ADRs                             | `AI_HANDOVER.md` §4.4, `docs/adr/`  |
| Traps already paid for — **read before writing code** | `AI_HANDOVER.md` §12                |
| What to take from the other three repos               | `AI_HANDOVER.md` §11                |
| The gate we are on                                    | `AI_HANDOVER.md` §13                |
| Who does what between Claude and Codex                | `AI_HANDOVER.md` §15.2              |

## Operating rules

- **No TODOs, placeholder logic, fake implementations, stub methods or pseudocode.** An
  interactable you can walk up to that does nothing is a stub. If one system depends on
  another, build both or stop and explain the missing dependency.
- **Run `npm run verify` before declaring any task complete.** It is
  format + lint + boundaries + typecheck + test.
- **Build whole gates autonomously; stop on any design decision.** Anything that changes
  gameplay, balance or feel — a drop rate, an XP curve, the death penalty, a control — goes to
  the owner. Engineering-quality decisions are yours; record them.
- **When this file, the handover and the code disagree, the code wins and the documents are
  bugs.** Fix them in the same commit.

## Workspace

```
packages/shared/   @alderfell/shared  ids, Result, RNG, tunables, protocol, content, world
packages/sim/      @alderfell/sim     deterministic kernel: nav, locomotion, economy, NPCs
packages/server/   @alderfell/server  gateway, sessions, identity, persistence
packages/client/   @alderfell/client  three.js renderer, React overlays, input, PWA
tools/scripts/check-boundaries.mjs    executable architecture linter, fails CI
```

Dependency direction, enforced by the linter: `shared` → nothing, `sim` → shared,
`server`/`client` → shared + sim.

```bash
npm run verify      # everything; run before every commit
npm run dev         # Vite dev server (client)
npm run dev:server  # the gateway
```

**Current: 362 tests across 30 files, all passing** (verified 2026-09-09, after G0's deletions).

## Rules the tooling enforces, so you cannot forget them

- `Math.random` and `Date.now` are **banned inside `packages/sim`** — inject `Rng` and the
  clock. Determinism is the whole reason client prediction and server validation can share one
  kernel.
- `consistent-type-imports` everywhere.
- Content is JSON validated at module load: bad content throws on import, never mid-harvest.
- Every tunable number lives in `DEFAULT_TUNABLES`. Gameplay code never hardcodes a literal.

## State

G0 (foundation reset) is complete. **G1 — the art gate — is next, and it is the one that
matters**: dress one zone with real environment art and produce a screenshot from a real
iPhone, launched from the home screen, that looks good. Nothing else proceeds until it passes.

## G1 Codex branch

`codex/g1-shorelands` adds the environment asset layer, warm palette, mobile HUD and
Playwright smoke harness. See `docs/G1_RETURN.md`. G1 remains provisional until visual
checks and the owner's actual iPhone/home-screen evidence pass. The simulation, server,
shared world graph and gameplay tunables have not changed.
