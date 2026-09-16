# G6-E — audited snapshot restore

The first operations mutation is intentionally one narrow repair: restore a player to a reviewed
retained snapshot. It is not a general account editor.

- The operator views the exact snapshot first, enters a 10–240 character support reason, and
  re-enters their Identity password.
- The Netlify proxy permits only this POST route, requires the configured administrator email, and
  refuses authentication older than ten minutes.
- Render validates the request and performs the existing atomic repository restore. The live save is
  captured as `PRE_RESTORE` before replacement, then an immutable receipt records actor, reason,
  source snapshot, and versions.
- The new `PRE_RESTORE` snapshot is the immediate undo path. No grant, deletion, XP, currency, ban,
  or free-form state edit was added.

Manual acceptance: select a snapshot, review it, restore with a reason and fresh password, verify
the receipt, then restore the new `PRE_RESTORE` snapshot to undo. Verify a stale version leaves the
live save untouched.
