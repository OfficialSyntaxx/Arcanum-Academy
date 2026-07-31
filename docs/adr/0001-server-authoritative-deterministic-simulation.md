# ADR-0001: Server-authoritative, deterministic simulation

**Status:** Accepted · Phase 1

## Context

The GDD requires real-time multiplayer, a player-driven market, tradeable graded
cards with unique serials, and "deterministic, debuggable game logic" — but it never
states who computes an outcome. In a game where a Grade 10 slab has real trade value,
that omission decides whether the economy survives contact with players.

Three options were considered:

1. **Client-authoritative.** Cheapest, and immediately farmable: anyone can grade
   perfect cards and mint currency by editing memory.
2. **Server-authoritative with rules on the server only.** Safe, but the client
   cannot predict, so every tap waits a round trip — unacceptable on mobile latency —
   or the rules get written twice and drift.
3. **Server-authoritative with a shared deterministic kernel.** One rule
   implementation, executed on both sides; the server's result is truth and the
   client's is a prediction.

## Decision

Option 3. `@arcanum/sim` is a headless deterministic kernel shared by client and
server. Clients predict locally for responsiveness; the server's result is
authoritative; divergence is detected by comparing canonical state hashes and
resolved by restoring an authoritative snapshot.

## Consequences

**Good**

- Rules exist once; client and server cannot drift.
- Duels and grading rolls are verifiable — replay the log, compare the hash.
- A desync report is a seed plus a command log, so bugs reproduce exactly.
- Prediction keeps the game responsive on a mobile connection.

**Costs**

- Determinism must be enforced continuously: no wall clock, no ambient randomness, no
  float-dependent rules. Lint rules and hash tests do this.
- Reconciliation logic is real work, and mispredictions must be handled visibly
  rather than snapped away.
- Both runtimes must stay in step on shared code, which constrains dependencies.

**Rejected alternatives:** client authority (economically fatal); server-only rules
(latency or duplicated logic).
