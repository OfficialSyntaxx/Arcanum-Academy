# The Arcanum Academy

A mobile-first web game: gather resources in a magical academy, refine them, scribe
spell cards, grade the results, build decks and duel.

This repository is at **Phase 2 complete**. The engine, architecture and tooling are
in place (Phase 1), and so is a living hub world: the Courtyard of the Arcanum, with
navigation, an orbiting camera, touch input, scheduled NPCs and accessibility
preferences (Phase 2).

No economic or combat systems exist yet - that is deliberate, and the order is set
out in [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md). Phase 3
is next: inventory, gathering, crafting and skills, server-authoritative.

## Play it

- **Client** - https://arcanum-academy.netlify.app
- **Server health** - https://arcanum-server-be28.onrender.com/healthz

Both redeploy on every push to `main`. The server runs on a free instance that sleeps
after inactivity, so the first connection after a quiet period takes 30-60 seconds.

## Getting started

```bash
nvm use          # Node 22
npm install
npm run dev      # client on http://localhost:5173
npm run dev:server   # server on http://localhost:8787
```

Copy `.env.example` to `.env` before running the server.

## Verifying a change

```bash
npm run verify   # format + lint + boundaries + typecheck + test
```

`npm run boundaries` is not a formality: it fails the build when a module imports
across an architectural layer it is not allowed to reach. The rules live in
`tools/scripts/check-boundaries.mjs` and are explained in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Packages

| Package           | Role                                                                       | May depend on   |
| ----------------- | -------------------------------------------------------------------------- | --------------- |
| `@arcanum/shared` | Ids, results, failures, deterministic RNG, wire protocol, balance tunables | nothing         |
| `@arcanum/sim`    | Deterministic simulation kernel, fixed clock, phase machine, state hashing | `shared`        |
| `@arcanum/server` | Authoritative server: gateway, sessions, persistence                       | `shared`, `sim` |
| `@arcanum/client` | PWA: renderer, input, transport, local storage, UI                         | `shared`, `sim` |

The simulation is headless on purpose. The same kernel runs in the browser for
prediction and on the server for authority, which is what makes duels verifiable
and desyncs detectable rather than mysterious.

## Documents

- [`docs/PROJECT_INITIALIZATION_REPORT.md`](docs/PROJECT_INITIALIZATION_REPORT.md) - architectural review of the GDD: gaps, risks, and the changes recommended before code was written
- [`docs/IMPLEMENTATION_ROADMAP.md`](docs/IMPLEMENTATION_ROADMAP.md) - the eight phases, with exit criteria
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - module boundaries and the rules the linter enforces
- [`docs/adr/`](docs/adr) - decision records
