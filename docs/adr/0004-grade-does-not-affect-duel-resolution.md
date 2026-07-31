# ADR 0004: Grade affects rewards, not duel resolution

- **Status:** Accepted
- **Date:** 2026-07-31
- **Supersedes:** the open question raised in Project Initialization Report §7.1

## Context

Three requirements pull against each other:

- GDD §11 makes grade matter "for both combat and collection value".
- GDD §18 opens a player-to-player market where any card, including a Grade 10
  slab, can be bought.
- GDD §22 and V2 §12 forbid pay-to-win and require that skill, deck construction
  and strategy remain the deciding factors.

V2 §12 resolves the tension by asking for grade bonuses that are _small_ rather
than absent. That is a defensible position, but "small" is not a design; it is a
number waiting to be chosen, and every number above zero is purchasable on an
open market. V2 §12 also instructs us to call out balance choices that threaten
competitive integrity, which this one does.

## Decision

Card **grade has no effect on any value read during duel resolution.** Grade
instead scales post-match rewards: currency, skill XP and material yield.

The rule is enforced structurally rather than by discipline. Card data is split
in two:

- **`CardDefinition`** — the rules of a spell: cost, effects, school, type. This
  is the only card data the combat resolver may read. It is shared, immutable and
  identical for every copy of the card in existence.
- **`CardInstance`** — the provenance of one physical copy: grade, serial, foil,
  slab state, owner, scribed-at. Read by the collection, market, display and
  reward systems. Never by the resolver.

A boundary rule will forbid the `combat` module from importing `CardInstance`,
so a future contributor cannot quietly reintroduce grade into damage maths.

## Rationale

- It satisfies every constraint in V2 §12 completely rather than partially. Skill,
  deck construction and strategy are not merely dominant over grade; they are the
  only inputs.
- It removes a permanent tax on the most-edited system in the game. A grade term
  in resolution would have to be carried by the resolver, replay verification,
  deck legality, rating, and market pricing, and would add a second axis to every
  determinism test.
- Grade stays economically meaningful. A reward multiplier is a real, ongoing
  incentive to own high grades, and it doubles as an economy lever: reward rates
  can be tuned without touching combat balance.
- Collection value never depended on power. Serial number, foil, slab
  presentation, public display and trade price already carry it.

## Consequences

- Slabbed cards get **presentational** advantages in duels instead of mechanical
  ones: a distinct card back, a reveal flourish on play, the serial visible on the
  battlefield. Players see that their best copies are in play without those copies
  being stronger.
- The market cannot sell wins. It can sell faster progression, which is a
  deliberate and bounded concession, capped by the reward multiplier ceiling in
  `TUNABLES.grading.rewardMultiplierMaxBasisPoints`.
- Two decks of identical lists are mechanically identical regardless of grade,
  which makes competitive results legible and makes replay verification exact.
- The decision is cheaply reversible. If grade must later influence duels, the
  change is confined to one seam: passing `CardInstance` into the resolver.
  Reversing it after the resolver has been built around grade would not be cheap,
  which is why this direction is the safer default.

## Alternative considered

**Small hard-capped in-match bonus** (V2 §12 as literally written). Rejected as
the default because the cap has to be enforced everywhere rather than in one
place, because it makes duel outcomes depend on wallet size by a margin players
will argue about endlessly, and because it is the harder direction to reverse.
