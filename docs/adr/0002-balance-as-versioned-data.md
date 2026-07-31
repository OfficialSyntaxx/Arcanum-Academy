# ADR-0002: Balance lives in versioned data, not in code

**Status:** Accepted · Phase 1

## Context

The GDD specifies dozens of numbers — deck size, turn timer, resonance cap, grade
bands, listing taxes, XP curves — and promises live-ops levers such as limited-time
grading bonuses and seasonal events. Meanwhile, replays and duel verification require
knowing which rules a match ran under.

Literals scattered through gameplay code make balance changes a client release, make
A/B tests impossible, and silently invalidate every stored replay.

## Decision

Every tunable lives in `DEFAULT_TUNABLES`, a frozen, versioned structure in
`@arcanum/shared`. Gameplay code reads tunables through the `Tunables` type and never
hardcodes a literal. Every replay, match record and desync report carries the
`tunablesVersion` it ran against.

## Consequences

**Good**

- Balance ships as data. Once remote config lands in Phase 7, a weekend event is a
  config push and a rollback is instant.
- Replays are exactly interpretable: they name the rules they ran under.
- Designers have one file to read, with every number in it.

**Costs**

- Slightly more indirection at call sites.
- The version must be bumped on every change; a stale version silently invalidates
  replay comparison, so this is enforced in review and in the replay tests.
- Remote config becomes a security surface — it must be signed and validated.
