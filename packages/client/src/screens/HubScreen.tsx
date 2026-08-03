import { useEffect, useState } from 'react';
import { HubHud, InteractionPrompt } from '../ui/HubOverlay.js';
import { JoystickPad } from '../ui/JoystickPad.js';
import { CommandError, CraftingPanel, GatheringHud, InventoryPanel } from '../ui/EconomyPanels.js';
import { useAppStore } from '../state/app-store.js';
import type { Joystick } from '../input/joystick.js';

/**
 * The hub overlay.
 *
 * Deliberately almost empty. The world is the content; chrome is a clock strip
 * at the top, a stick zone bottom-left and one contextual button bottom-right.
 * Everything else the GDD calls for — inventory, collection, deckbuilder — opens
 * as a full-surface panel from later phases rather than crowding this layer,
 * because a hub HUD that fills the screen on a phone leaves nothing to look at.
 *
 * It takes the two things it needs rather than the controller that owns them, so
 * the screen layer never depends on the composition root.
 */
export interface HubScreenProps {
  readonly joystick: Joystick;
  readonly onEngage: () => void;
  readonly onCollect: () => void;
  readonly onStopGathering: () => void;
  readonly onClaimOffline: () => void;
  readonly onCraft: (recipeId: string) => void;
}

/**
 * How often a running session asks the server what it has earned.
 *
 * This is also what keeps the player counted as present: the server only pays
 * the attended rate as far as the last contact, so a client that never spoke
 * while gathering would be treated as away and paid a quarter.
 */
const COLLECTION_POLL_MS = 10_000;

export function HubScreen({
  joystick,
  onEngage,
  onCollect,
  onStopGathering,
  onClaimOffline,
  onCraft,
}: HubScreenProps) {
  const gatheringNodeId = useAppStore((state) => state.economy.gatheringNodeId);
  const openStationId = useAppStore((state) => state.openStationId);
  const setOpenStation = useAppStore((state) => state.setOpenStation);

  useEffect(() => {
    if (gatheringNodeId === null) return;
    const timer = setInterval(onCollect, COLLECTION_POLL_MS);
    return () => clearInterval(timer);
  }, [gatheringNodeId, onCollect]);

  // The satchel is a panel rather than a permanent strip: it is consulted
  // occasionally and would otherwise cost screen the world should be using.
  const [satchelOpen, setSatchelOpen] = useState(false);

  return (
    <div className="hub">
      <HubHud />
      <JoystickPad joystick={joystick} />
      <InteractionPrompt onEngage={onEngage} />
      <GatheringHud
        onCollect={onCollect}
        onStop={onStopGathering}
        onClaimOffline={onClaimOffline}
      />
      <CommandError />
      {openStationId !== null && (
        <CraftingPanel
          stationInteractableId={openStationId}
          onCraft={onCraft}
          onClose={() => setOpenStation(null)}
        />
      )}
      {satchelOpen ? (
        <InventoryPanel onClose={() => setSatchelOpen(false)} />
      ) : (
        <button
          type="button"
          className="satchel-toggle"
          onClick={() => setSatchelOpen(true)}
          aria-label="Open satchel"
        >
          Satchel
        </button>
      )}
    </div>
  );
}
