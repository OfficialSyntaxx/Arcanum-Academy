import { useEffect, useState } from 'react';
import { HubHud, InteractionPrompt } from '../ui/HubOverlay.js';
import { CommandError, CraftingPanel, GatheringHud, InventoryPanel } from '../ui/EconomyPanels.js';
import { useAppStore } from '../state/app-store.js';

/**
 * The hub overlay.
 *
 * Deliberately almost empty. The world is the content; chrome is a clock strip
 * at the top and one contextual button bottom-right. Everything else —
 * inventory, crafting — opens as a panel over it rather than crowding this
 * layer, because a HUD that fills the screen on a phone leaves nothing to look
 * at.
 *
 * There is no movement control here. Walking is a tap on the world, which
 * belongs to the canvas underneath, so this layer stays out of the way of the
 * gesture that matters most.
 *
 * It takes the callbacks it needs rather than the controller that owns them, so
 * the screen layer never depends on the composition root.
 */
export interface HubScreenProps {
  readonly onEngage: () => void;
  readonly onCollect: () => void;
  readonly onStopGathering: () => void;
  readonly onCraft: (recipeId: string) => void;
}

/**
 * How often a running session asks the server what it has earned.
 *
 * This is also what keeps the player counted as present: the server pays only
 * as far as the last contact, and with no offline accrual (D5) a client that
 * went quiet while gathering earns nothing for the silence beyond the grace
 * window.
 */
const COLLECTION_POLL_MS = 10_000;

export function HubScreen({ onEngage, onCollect, onStopGathering, onCraft }: HubScreenProps) {
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
      <div className="hub-help">Tap to walk · Drag to look · Pinch to zoom</div>
      <InteractionPrompt onEngage={onEngage} />
      <GatheringHud onCollect={onCollect} onStop={onStopGathering} />
      <CommandError />
      <button
        type="button"
        className="satchel-toggle"
        onClick={() => setSatchelOpen((open) => !open)}
      >
        Satchel
      </button>
      {satchelOpen && <InventoryPanel onClose={() => setSatchelOpen(false)} />}
      {openStationId !== null && (
        <CraftingPanel
          stationInteractableId={openStationId}
          onCraft={onCraft}
          onClose={() => setOpenStation(null)}
        />
      )}
    </div>
  );
}
