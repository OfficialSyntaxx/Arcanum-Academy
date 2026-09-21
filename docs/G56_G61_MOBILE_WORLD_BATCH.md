# G56–G61: Mobile World Reliability Batch

This client-only batch improves how the expanded world reads and responds on touch devices. It does not alter server authority, combat timing, Ironman rules, economy, progression, persistence, or player data handling.

- Frostgate gains a reachable exterior workshop and an authored Aurora Shelf destination beyond the Frozen Spire.
- Emberwood's lumber mill and Cindermark's forge use exterior approach points rather than points inside their buildings; the Mushroom Bog approach sits on the bank rather than in the canal.
- The contextual prompt can expose more than one nearby authored action. Each selection keeps its own approach and interaction identity.
- Queued one-tap actions validate the selected target itself at arrival, rather than being cancelled because another overlapping interaction happens to be closer.

The work remains local/read-only from a social and privacy perspective. It makes no network protocol or server runtime change.

## Acceptance focus

Use a physical iPhone for final acceptance. At every supported portrait width and 844×390 landscape:

1. Walk to each exterior station and verify the prompt appears before entering building geometry.
2. Where two authored interactions share an approach, verify every visible choice activates its own label and never a neighbouring target.
3. Verify the action surface stays above the tab bar and retains at least 48 px touch targets.
4. Re-check the Shore Wolf first kill and the 600 ms combat rhythm; they are intentionally untouched.
