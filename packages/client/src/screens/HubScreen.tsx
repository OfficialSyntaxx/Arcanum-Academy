import { useEffect, useState } from 'react';
import { WorldMap } from '../ui/WorldMap.js';
import { HubHud, InteractionPrompt } from '../ui/HubOverlay.js';
import {
  CommandError,
  BankPanel,
  MerchantPanel,
  CraftingPanel,
  CollectionToast,
  EquipmentPanel,
  GatheringHud,
  InventoryPanel,
} from '../ui/EconomyPanels.js';
import { useAppStore } from '../state/app-store.js';
import { NoticeBoard } from '../ui/NoticeBoard.js';

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
  readonly onNavigate: (id: string) => void;
  readonly onCollect: () => void;
  readonly onStopGathering: () => void;
  readonly onCraft: (recipeId: string) => void;
  readonly onDeposit: (itemId: string, quantity: number) => void;
  readonly onWithdraw: (itemId: string, quantity: number) => void;
  readonly onSell: (itemId: string, quantity: number) => void;
  readonly onRepair: (skillId: string) => void;
  readonly onUpgradeTool: (toolId: string) => void;
}

/**
 * How often a running session asks the server what it has earned.
 *
 * This is also what keeps the player counted as present: the server pays only
 * as far as the last contact, and with no offline accrual (D5) a client that
 * went quiet while gathering earns nothing for the silence beyond the grace
 * window.
 */
const COLLECTION_POLL_MS = 3_000;

export function HubScreen({
  onEngage,
  onCollect,
  onStopGathering,
  onCraft,
  onDeposit,
  onWithdraw,
  onSell,
  onRepair,
  onUpgradeTool,
  onNavigate,
}: HubScreenProps) {
  const gatheringNodeId = useAppStore((state) => state.economy.gatheringNodeId);
  const openStationId = useAppStore((state) => state.openStationId);
  const openBankId = useAppStore((state) => state.openBankId);
  const openMerchantId = useAppStore((state) => state.openMerchantId);
  const openNoticeId = useAppStore((state) => state.openNoticeId);
  const travelRevision = useAppStore((state) => state.travelRevision);
  const setOpenStation = useAppStore((state) => state.setOpenStation);
  const setOpenBank = useAppStore((state) => state.setOpenBank);
  const setOpenMerchant = useAppStore((state) => state.setOpenMerchant);
  const setOpenNotice = useAppStore((state) => state.setOpenNotice);

  // Satchel and map are local presentation state, while crafting and prompts
  // live in the app store. They all subscribe to the same travel boundary.
  const [satchelView, setSatchelView] = useState<'inventory' | 'equipment' | null>(null);
  const [mapOpen, setMapOpen] = useState(false);

  useEffect(() => {
    setSatchelView(null);
    setMapOpen(false);
  }, [travelRevision]);

  useEffect(() => {
    if (gatheringNodeId === null) return;
    const timer = setInterval(onCollect, COLLECTION_POLL_MS);
    return () => clearInterval(timer);
  }, [gatheringNodeId, onCollect]);

  // The satchel is a panel rather than a permanent strip: it is consulted
  // occasionally and would otherwise cost screen the world should be using.

  return (
    <div className="hub">
      <HubHud />
      <button type="button" className="map-toggle" onClick={() => setMapOpen(true)}>
        Map
      </button>
      {mapOpen && <WorldMap onNavigate={onNavigate} onClose={() => setMapOpen(false)} />}
      <div className="hub-help">Tap to walk · Drag to look · Pinch to zoom</div>
      <InteractionPrompt onEngage={onEngage} />
      <GatheringHud onCollect={onCollect} onStop={onStopGathering} />
      <CollectionToast />
      <CommandError />
      <button
        type="button"
        className="satchel-toggle"
        onClick={() => setSatchelView((view) => (view === null ? 'inventory' : null))}
      >
        Satchel
      </button>
      {satchelView === 'inventory' && (
        <InventoryPanel
          onClose={() => setSatchelView(null)}
          onOpenEquipment={() => setSatchelView('equipment')}
        />
      )}
      {satchelView === 'equipment' && <EquipmentPanel onBack={() => setSatchelView('inventory')} />}
      {openStationId !== null && (
        <CraftingPanel
          stationInteractableId={openStationId}
          onCraft={onCraft}
          onClose={() => setOpenStation(null)}
        />
      )}
      {openBankId !== null && (
        <BankPanel
          onDeposit={onDeposit}
          onWithdraw={onWithdraw}
          onClose={() => setOpenBank(null)}
        />
      )}
      {openMerchantId !== null && (
        <MerchantPanel
          onSell={onSell}
          onRepair={onRepair}
          onUpgradeTool={onUpgradeTool}
          onClose={() => setOpenMerchant(null)}
        />
      )}
      {openNoticeId !== null && <NoticeBoard onClose={() => setOpenNotice(null)} />}
    </div>
  );
}
