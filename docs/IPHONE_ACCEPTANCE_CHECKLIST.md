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

## Report back

For any issue, send: checklist section, exact step, what you expected, what happened, portrait or
landscape, and a screenshot/video if possible. “Everything passed” is also useful: it closes this
manual acceptance gate.
