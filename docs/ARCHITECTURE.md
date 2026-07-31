# Architecture

## Shape

```
                       ┌───────────────────────────┐
                       │      @arcanum/shared      │
                       │  ids · Result · Failure   │
                       │  Rng · EventBus · Logger  │
                       │  protocol · tunables      │
                       │  migrations               │
                       └────────────┬──────────────┘
                                    │
                       ┌────────────┴──────────────┐
                       │       @arcanum/sim        │
                       │  FixedClock · hashState   │
                       │  StateMachine · phases    │
                       │  Simulation (kernel)      │
                       │  headless · deterministic │
                       └──────┬─────────────┬──────┘
                              │             │
        ┌─────────────────────┴──┐       ┌──┴──────────────────────┐
        │    @arcanum/client     │       │    @arcanum/server      │
        │  app                   │       │  index (composition)    │
        │  screens · ui          │       │  net (gateway)          │
        │  state                 │       │  session                │
        │  render input net      │       │  persistence            │
        │  persistence           │       │  config                 │
        │  core                  │       │                         │
        └────────────────────────┘       └─────────────────────────┘
```

`shared` depends on nothing. `sim` depends only on `shared` and touches no DOM, no
network and no filesystem, which is why the same simulation runs in a browser for
prediction and on the server for authority.

## The rules the linter enforces

`npm run boundaries` walks every source file, extracts its imports, and fails on a
violation. It is not advisory — it runs in CI ahead of the typecheck.

**Package rules**

| Package  | May import                 | May never import                   |
| -------- | -------------------------- | ---------------------------------- |
| `shared` | nothing from the workspace | three, react, zustand, fastify, ws |
| `sim`    | `shared`                   | three, react, zustand, fastify, ws |
| `server` | `shared`, `sim`            | three, react, zustand              |
| `client` | `shared`, `sim`            | fastify, ws                        |

**Client layer rules** — a layer may import itself and the layers listed:

| Layer                                   | May import                              |
| --------------------------------------- | --------------------------------------- |
| `core`                                  | —                                       |
| `render`, `input`, `net`, `persistence` | `core`                                  |
| `state`                                 | `core`, `net`                           |
| `ui`                                    | `state`, `core`                         |
| `screens`                               | `state`, `ui`, `core`                   |
| `app`                                   | everything (it is the composition root) |

**Server layer rules**

| Layer                              | May import                         |
| ---------------------------------- | ---------------------------------- |
| `config`, `session`, `persistence` | —                                  |
| `net`                              | `session`, `persistence`, `config` |

Tests are exempt from layer rules; they legitimately reach across layers to assert.

## Determinism contract

Anything that decides game state obeys these, and the lint rules enforce the first two
inside `packages/sim`:

1. No `Math.random`. Randomness comes from the injected `Rng`.
2. No `Date.now()` or `performance.now()`. Time is the tick.
3. Reducers are pure — no I/O, no mutation of the incoming state.
4. Iteration order is explicit. Object key order is never load-bearing; the canonical
   hash sorts keys precisely so it cannot be.
5. Floating point is avoided in rules. Weights, costs and thresholds are integers.

Two machines running the same seed and the same ordered command log must produce the
same `hashState`. That single property is what makes server authority affordable,
prediction possible, duels verifiable, and desync reports reproducible.

## Data flow

**Player input → world**

```
pointer → InputService (gesture intent)
        → app layer builds a Command
        → Simulation.enqueue          (local prediction)
        → Transport.send              (to the server)
        ← server validates, applies, broadcasts a patch
        → reconcile: compare hash, restore snapshot on mismatch
```

**Frame**

```
requestAnimationFrame
  → FixedClock.advance(deltaMs)  → { steps, alpha, droppedMs }
  → Simulation.run(steps)        (fixed timestep, deterministic)
  → RenderService.render()       (interpolated by alpha)
  → store.setFrameStats(...)     (UI projection only)
```

The simulation never reads the render clock, and the renderer never writes simulation
state. The UI store is a projection, not a source.

## Boot sequence

`app/bootstrap.ts` is the only place services are constructed. Order matters, and
each step is fault-tolerant where a player could still play without it:

1. **Device signals** — decides every renderer setting
2. **Storage** — IndexedDB, falling back to memory in private browsing
3. **Identity** — restored locally, claimed against the server
4. **Renderer and input**
5. **Transport** — failure is a banner, never a blocked boot
6. **Frame loop** — then the phase machine enters the world

Each step reports into `bootSteps`, so a failed start is diagnosable from the screen
rather than from a console the player cannot open.

## Testing strategy

| Layer                                        | Approach                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------- |
| Pure logic (rng, hash, migrations, protocol) | Unit tests, including distribution and adversarial input                            |
| Simulation                                   | Determinism tests: same seed and log, same hash; arrival order independence         |
| Gateway                                      | Injected socket interface — the whole protocol is tested without a network          |
| Transport                                    | Injected socket, clock and timers — reconnection and backoff tested without waiting |
| Persistence                                  | In-memory adapter behind the real port, including concurrency conflicts             |
| Architecture                                 | The boundary linter, verified to fail on a real violation                           |

Nothing is mocked that could be injected instead. A test that mocks the thing it is
testing proves nothing.

## Client layers added in Phase 2

| Layer    | May import | Owns                                              |
| -------- | ---------- | ------------------------------------------------- |
| `world`  | `core`     | Zone loading, geometry, actor pool, lighting      |
| `camera` | —          | The follow rig and shot framing                   |
| `player` | `world`    | The player's mover and control scheme arbitration |
| `npc`    | `world`    | Named and ambient agent population                |
| `a11y`   | —          | Preference model and its projection onto the root |

`screens` may not import `app`: the hub screen takes the two values it needs as
props rather than the controller that owns them, so the screen layer never
depends on the composition root.

## Where world rules live

Navigation, locomotion, schedules and NPC stepping are all in `@arcanum/sim`, not
in the client. They are pure, deterministic and free of `three`, which is what
lets the server validate a player's movement against the same graph and the same
integrator the client used to produce it. The client layers above contain wiring
and presentation only.
