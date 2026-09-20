# G42 — touch-safe economy quantities

## Scope

Make bank and merchant quantity controls fit phone widths without sacrificing touch size or screen
reader context.

## iPhone acceptance

1. Open the Reclaimer's Cache with stacks of at least 1, 5, and 10 items.
2. Confirm the visible choices read `1`, `5`, `10`, `X`, and `All` and wrap without horizontal
   overflow at 320px.
3. Confirm every button and the custom input is at least 48 by 48 CSS pixels.
4. With VoiceOver, confirm each compact control announces Deposit, Withdraw, or Sell as applicable.
5. Enter `0`, a negative value, and an empty value; confirm the `X` action stays disabled.
6. Enter more than the available stack; confirm the existing client clamp and server validation
   still prevent an oversized transfer.

## Boundaries

This changes local control presentation and pre-submit validation only. It does not alter prices,
quantities, inventory capacity, transfer semantics, persistence, progression, networking, server
runtime, social features, assets, or hosting.
