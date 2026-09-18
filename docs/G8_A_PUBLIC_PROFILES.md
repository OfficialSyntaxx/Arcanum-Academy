# G8-A — public profiles and hiscores

Players remain private by default. From the in-game **Profile** tab, a player may choose a
3–24-character display name and opt into public listing.

Public hiscores expose only: display name, total level, total XP, combat level, rank, and update
time. They never expose player IDs, account email, Netlify subject, inventory, bank, equipment,
location, active quest, recovery status, or operations data.

Scores are derived by Render from authoritative saved skill progress. The client never submits XP,
levels, rank, or another player's identifier. The endpoint is read-only and currently returns the
top 25 opted-in profiles; this is intentionally a small, safe foundation for later profile pages
and comparison rather than a social system or trading surface.

## Phone acceptance

- Open **Profile** from the lower tab bar; confirm it stays readable in portrait and landscape.
- Save a valid display name while public listing is off. Confirm the profile stays absent from
  hiscores.
- Enable public listing, save, reopen the panel, and confirm the same name and aggregate stats
  appear once.
- Disable public listing, save, reopen, and confirm it disappears.
- Try a too-short or punctuation-only public name. Confirm it is refused without changing the
  saved public profile.
- Confirm no profile view reveals an ID, inventory, quest state, or location.
