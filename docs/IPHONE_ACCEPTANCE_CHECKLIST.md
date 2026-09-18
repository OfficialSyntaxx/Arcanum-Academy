# Alderfell iPhone acceptance checklist

Use this on an installed PWA when convenient. It is a manual feel/readability pass, not a
replacement for the automated verification gate. Test on both portrait and landscape where noted;
record the first failed item, a screenshot, and the device/OS version.

## Before the route

- [ ] Open the installed PWA from the iPhone home screen; confirm it reaches Shorelands without a
      blank canvas, console-visible fault screen, or stalled loading state.
- [ ] In portrait, tap-to-walk, drag-to-rotate, and pinch-to-zoom all feel responsive and do not
      trigger nearby interactions accidentally.
- [ ] In landscape, the HUD stays within the safe area and no panels, prompt buttons, or close
      controls overlap.
- [ ] Walk through a portal gateway, return, and confirm the world/HUD remain responsive.
- [ ] Watch a full dawn → day → dusk → night transition. Confirm terrain, paths, campfire,
      portals, encounter rings, and the gravestone marker remain easy to read.
- [ ] During mist and light rain, confirm the effect is atmospheric rather than distracting and
      movement remains smooth.

## First journey: gather, cook, hunt

- [ ] The Journey card points to the Library notice board before the first quest and opens the
      local map. It should hide during an active fight.
- [ ] Accept **The First Kindling**. Gather three mushroom variants/counts in the Alchemy Gardens;
      confirm the objective count updates only after real gathering.
- [ ] Return to the board, turn in the quest once, and confirm the 40-coin reward appears once.
- [ ] Accept **The First Hunt**. Confirm Referee Calla Dun directs you to the Duelling Terrace and
      the Shore Wolf ring makes the encounter easy to locate.
- [ ] Defeat two Shore Wolves. Confirm each kill visibly updates the quest count, and the wolf's
      idle, hit, retaliation, defeat, and respawn presentation reads correctly.
- [ ] Pick up Raw Shore Wolf Meat, use the Shorelands Campfire, and confirm the panel says
      **Cooking**/**Cook** rather than refining. Cook one meat and turn in the quest for 60 coins.
- [ ] During a live fight, eat a cooked food. Confirm it heals the expected amount, delays the
      next attack by one 600 ms tick, and does not show a player attack animation for eating.
- [ ] Start travelling during/after a fight. Confirm stale combat HUD and target state clear.

## Combat progression and recovery

- [ ] Try Accurate, Aggressive, and Defensive styles. Confirm the HUD names the matching trained
      stat; dealing damage also advances Hitpoints.
- [ ] Fight an Emberwing Armabee. Confirm its terrace ring, name, animations, 8-coin reward, and
      Armabee Wax drop are clear and distinct from the Shore Wolf.
- [ ] Carry more than three low-value items, die, and confirm the three highest-value individual
      items stay in the bag while the rest appear at the death location.
- [ ] Locate the amber gravestone beacon, return within interaction range, and recover every item.
- [ ] With a full satchel, try recovery. Confirm recovery is refused without deleting or partly
      moving any grave items; make room and recover normally.

## Quest continuity and guidance

- [ ] Open the Quest Journal from the Journey card. Confirm Active, Available, Complete, and
      Locked states make sense, and its counts match the Notice Board.
- [ ] Complete **Embers for the Archive** using Emberwood Branches and Crystal Shards; confirm the
      75-coin reward is granted once.
- [ ] Accept **A Clear Copy**. Confirm Professor Ilyra Vosk explains the Azure Ink route:
      Pale Caps + Crystal Shards → Resonant Dust → Azure Ink.
- [ ] Craft and submit one Azure Ink. Confirm the quest completes once for 35 coins and remains
      complete after a refresh/reopen.
- [ ] Speak to Bram, Calla Dun, Archivist Onn, and Professor Vosk at relevant quest states. Their
      dialogue should guide the current task without accepting, completing, or changing quest state.

## Collection log and diaries

- [ ] Open **Log** from the Journey card. Confirm undiscovered entries remain hidden and newly
      confirmed gathering, crafting, combat, and recovery entries reveal their real names.
- [ ] Complete **A Shorelands Circuit**, **Hands to Work**, and **The Terrace Remembers**. Confirm
      each diary awards exactly 15 coins once and displays its paid status.
- [ ] Refresh after a diary completes, repeat its final activity, and confirm it neither loses its
      completion nor pays another reward.

## G5-E: The Saltwake Ruins

- [ ] Complete **A Clear Copy**, accept **Beneath the Saltline**, and confirm Archivist Onn points
      toward the new descent beside the Library shore.
- [ ] Attempt the descent before accepting the quest on a fresh account. Confirm the server
      refuses entry rather than switching zones locally.
- [ ] Enter the Flooded Antechamber in portrait and landscape. Confirm the teal fog, water,
      route, exit, room objective card, and safe-area placement remain readable.
- [ ] Defeat the Drowned Sentinel in the Broken Gallery. Confirm its Ghost-based CC0 model plays
      idle, hit, attack, defeat, and respawn animations and unlocks the Warden encounter.
- [ ] Try to challenge the Drowned Warden before clearing the Sentinel. Confirm it is refused.
- [ ] Fight the Drowned Warden. Confirm the boss HUD announces phase 2 below half health, incoming
      damage increases visibly, and Defensive style reduces that damage by one.
- [ ] Die in the gallery and again in the vault. Confirm the permanent gravestone appears only in
      the Saltwake Ruins, retains all unprotected items across the second death, and cannot be
      reclaimed from matching Shorelands coordinates.
- [ ] Defeat the Warden with a full satchel and try the Tideglass Reliquary. Confirm the claim is
      refused without marking the chest complete; free a slot and claim again.
- [ ] Confirm the Reliquary grants exactly one Tideglass Charm, restores the Library shortcut,
      reveals all four Saltwake discoveries, and does not grant a second charm after refresh.
- [ ] Return to Archivist Onn and complete **Beneath the Saltline**. Confirm the 100-coin reward
      pays once and the Tideglass Charm remains in the satchel.
- [ ] Complete **The Saltwake Remembers** and confirm its 15-coin diary reward pays once.
- [ ] Close and reopen the PWA while inside the ruins. Confirm the server-confirmed Saltwake zone
      is restored safely at the antechamber rather than dropping the player into an invalid room.

## G5-F: The Tideglass Trail

- [ ] Before completing **Beneath the Saltline**, inspect any gold clue marker. Confirm the server
      refuses to start the trail or reveal progress.
- [ ] After completing the quest, return to the Warden's Vault. Confirm the clue card names **The
      Tideglass Trail** and points to the tide-cut bearings.
- [ ] Inspect the Warden's Bearings, then follow the card to the Library Plinth, Resonance Mark, and
      Tidepool Cache. Confirm later sites cannot be completed out of order.
- [ ] At each step, refresh or close/reopen the PWA and confirm the same next clue remains active.
- [ ] Confirm the gold ring/halo marker and clue card remain readable at dawn, night, and in rain,
      in portrait and short landscape, without covering the combat controls.
- [ ] Walk away before pressing Inspect/Uncover and confirm a remote interaction is refused.
- [ ] Uncover the Tidepool Cache and confirm exactly 45 coins are added once. Revisit and refresh;
      confirm no second reward is granted and the active clue card is gone.

## G7-A: Player account recovery

- [ ] Enable/configure the separate player Identity tenant using
      `docs/G7_A_ACCOUNT_RECOVERY_HANDOVER.md`; do not reuse the operations tenant.
- [ ] On the existing character, open **Account**, create and confirm a login, sign in, and choose
      **Protect this character**. Confirm reload returns the same player ID and progress.
- [ ] In a clean/private second browser, sign into the same login and choose **Recover my
      character**. Confirm the original player ID and progress return.
- [ ] Confirm the older browser no longer authenticates with its rotated token, then recover there
      if needed.
- [ ] Complete a password reset and confirm the reset login can still recover the protected player.
- [ ] Try linking the same login to a different disposable player. Confirm it is refused and neither
      save changes.

## G8-A: Public profiles and hiscores

- [ ] Open **Profile** from the tab bar in portrait and landscape. Confirm it remains readable and
      does not obstruct the important world controls.
- [ ] Save a valid name with public listing disabled. Confirm it does not appear in hiscores.
- [ ] Enable public listing, save, reopen Profile, and confirm the name, total level, combat level,
      and total XP appear once.
- [ ] Disable public listing, save, and confirm it disappears from hiscores.
- [ ] Confirm no public view exposes a player ID, inventory, bank, location, quest state, or account
      recovery information.

## G8-C: Public profile comparison

- [ ] With two opted-in characters, open a hiscore entry in **Profile** and confirm its comparison
      shows your totals, discoveries, diary milestones, and skills beside the selected public record.
- [ ] Advance a skill or diary on one account, reopen the profile after its save, and confirm the
      comparison updates that account's public numbers without changing the other side locally.
- [ ] Confirm a private character remains absent from hiscores and cannot be selected for comparison.
- [ ] In portrait and landscape, scroll the skill rows, close the comparison, and confirm Profile
      remains readable without covering critical world controls.

## G8-D: Public profile links

- [ ] Select an opted-in hiscore entry, press **Share**, and confirm iOS presents the native share
      sheet with an `arcanum-academy.netlify.app` link rather than a player ID or account token.
- [ ] Open that link in a clean/private browser. Confirm Profile opens directly to the selected
      public comparison and the game still remains playable.
- [ ] Close the comparison or Profile. Confirm the `profile` URL parameter is removed.
- [ ] Disable the selected character's public listing, then reopen its prior shared link. Confirm it
      reveals no public profile details.

## Report back

For any issue, send: checklist section, exact step, what you expected, what happened, portrait or
landscape, and a screenshot/video if possible. “Everything passed” is also useful: it closes this
manual acceptance gate.
