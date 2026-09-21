import { lazy, Suspense, useEffect, useState } from 'react';
import { ClueTracker, HubHud, InteractionPrompt, JourneyTracker } from '../ui/HubOverlay.js';
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
import { NpcDialogue } from '../ui/NpcDialogue.js';
import { CombatHud, DungeonHud, GravestoneHud } from '../ui/CombatHud.js';
import { Minimap } from '../ui/Minimap.js';
import { clearPublicProfileLink, publicProfileIdFromUrl } from '../ui/public-profile-link.js';

const WorldMap = lazy(async () => ({ default: (await import('../ui/WorldMap.js')).WorldMap }));
const QuestJournal = lazy(async () => ({
  default: (await import('../ui/QuestJournal.js')).QuestJournal,
}));
const CollectionLog = lazy(async () => ({
  default: (await import('../ui/CollectionLog.js')).CollectionLog,
}));
const PublicProfile = lazy(async () => ({
  default: (await import('../ui/PublicProfile.js')).PublicProfile,
}));

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
  readonly onEngage: (id?: string) => void;
  readonly onNavigate: (id: string) => void;
  readonly onNavigateWaypoint: (id: string) => void;
  readonly onCollect: () => void;
  readonly onStopGathering: () => void;
  readonly onCraft: (recipeId: string) => void;
  readonly onDeposit: (itemId: string, quantity: number) => void;
  readonly onWithdraw: (itemId: string, quantity: number) => void;
  readonly onSell: (itemId: string, quantity: number) => void;
  readonly onRepair: (skillId: string) => void;
  readonly onUpgradeTool: (toolId: string) => void;
  readonly onAcceptQuest: (questId: string) => void;
  readonly onCompleteQuest: (questId: string) => void;
  readonly onRecoverCombat: () => void;
  readonly onReclaimCombatGrave: () => void;
  readonly onEatCombatFood: (interactableId: string, itemId: string) => void;
  readonly onEquip: (itemId: string) => void;
  readonly onUnequip: (slot: string) => void;
  readonly onUpdateProfile: (displayName: string | null, isPublic: boolean) => void;
  readonly serverUrl: string;
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
  onAcceptQuest,
  onCompleteQuest,
  onNavigate,
  onNavigateWaypoint,
  onRecoverCombat,
  onReclaimCombatGrave,
  onEatCombatFood,
  onEquip,
  onUnequip,
  onUpdateProfile,
  serverUrl,
}: HubScreenProps) {
  const gatheringNodeId = useAppStore((state) => state.economy.gatheringNodeId);
  const openStationId = useAppStore((state) => state.openStationId);
  const openBankId = useAppStore((state) => state.openBankId);
  const openMerchantId = useAppStore((state) => state.openMerchantId);
  const openNoticeId = useAppStore((state) => state.openNoticeId);
  const openDialogue = useAppStore((state) => state.openDialogue);
  const travelRevision = useAppStore((state) => state.travelRevision);
  const currentZoneId = useAppStore((state) => state.currentZoneId);
  const setOpenStation = useAppStore((state) => state.setOpenStation);
  const setOpenBank = useAppStore((state) => state.setOpenBank);
  const setOpenMerchant = useAppStore((state) => state.setOpenMerchant);
  const setOpenNotice = useAppStore((state) => state.setOpenNotice);
  const setOpenDialogue = useAppStore((state) => state.setOpenDialogue);
  const hudCollapsed = useAppStore((state) => state.hudCollapsed);
  const setHudCollapsed = useAppStore((state) => state.setHudCollapsed);
  const inCombat = useAppStore((state) => state.economy.combat !== null);

  // Satchel and map are local presentation state, while crafting and prompts
  // live in the app store. They all subscribe to the same travel boundary.
  const [satchelView, setSatchelView] = useState<'inventory' | 'equipment' | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapDestinationId, setMapDestinationId] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sharedProfileId, setSharedProfileId] = useState(() =>
    publicProfileIdFromUrl(window.location.href),
  );
  const [profileOpen, setProfileOpen] = useState(sharedProfileId !== null);

  function closeProfile() {
    const link = clearPublicProfileLink(window.location.href);
    if (link) window.history.replaceState(null, '', link);
    setSharedProfileId(null);
    setProfileOpen(false);
  }

  useEffect(() => {
    setSatchelView(null);
    setMapOpen(false);
    setJournalOpen(false);
    setCollectionOpen(false);
    const link = clearPublicProfileLink(window.location.href);
    if (link) window.history.replaceState(null, '', link);
    setSharedProfileId(null);
    setProfileOpen(false);
  }, [travelRevision]);

  // A map route starts moving immediately, so its local focus must survive the
  // same travel boundary that dismisses panels. Zone travel is the reliable
  // point where an old-zone destination can no longer be meaningful.
  useEffect(() => {
    setMapDestinationId(null);
  }, [currentZoneId]);

  useEffect(() => {
    if (gatheringNodeId === null) return;
    const timer = setInterval(onCollect, COLLECTION_POLL_MS);
    return () => clearInterval(timer);
  }, [gatheringNodeId, onCollect]);

  // The satchel is a panel rather than a permanent strip: it is consulted
  // occasionally and would otherwise cost screen the world should be using.

  return (
    <div className="hub" data-collapsed={hudCollapsed ? 'true' : 'false'}>
      <HubHud />
      {/* One control folds every fixed overlay away so the world is what fills
          the phone. Panels the player opens on purpose are unaffected. */}
      <button
        type="button"
        className="hud-fold"
        aria-pressed={hudCollapsed}
        aria-label={hudCollapsed ? 'Show overlays' : 'Hide overlays'}
        onClick={() => setHudCollapsed(!hudCollapsed)}
      >
        {hudCollapsed ? '▾' : '▴'}
      </button>
      {!hudCollapsed && <JourneyTracker onOpenJournal={() => setJournalOpen(true)} />}
      {!hudCollapsed && <ClueTracker />}
      {!hudCollapsed && (
        <Minimap focusedDestinationId={mapDestinationId} onOpenMap={() => setMapOpen(true)} />
      )}
      <Suspense
        fallback={
          <div className="panel panel-loading" role="status">
            Opening panel…
          </div>
        }
      >
        {mapOpen && (
          <WorldMap
            selectedDestinationId={mapDestinationId}
            onNavigate={(id) => {
              setMapDestinationId(id);
              onNavigate(id);
            }}
            onNavigateWaypoint={(id) => {
              setMapDestinationId(id);
              onNavigateWaypoint(id);
            }}
            onClose={() => setMapOpen(false)}
          />
        )}
        {journalOpen && <QuestJournal onClose={() => setJournalOpen(false)} />}
        {collectionOpen && <CollectionLog onClose={() => setCollectionOpen(false)} />}
        {profileOpen && (
          <PublicProfile
            serverUrl={serverUrl}
            onUpdate={onUpdateProfile}
            initialPublicId={sharedProfileId}
            onClose={closeProfile}
          />
        )}
      </Suspense>
      {!inCombat && <InteractionPrompt onEngage={onEngage} />}
      <GatheringHud onCollect={onCollect} onStop={onStopGathering} />
      <CollectionToast />
      {!hudCollapsed && <DungeonHud />}
      <CommandError />
      <CombatHud onRecover={onRecoverCombat} onEat={onEatCombatFood} />
      <GravestoneHud onReclaim={onReclaimCombatGrave} />
      {/* OSRS-style tab bar: every panel the player opens on purpose lives here,
          so the top of the screen stays clear for the world and the minimap. */}
      <nav className="tab-bar" aria-label="Game panels">
        <button
          type="button"
          aria-pressed={satchelView !== null}
          onClick={() => setSatchelView((view) => (view === null ? 'inventory' : null))}
        >
          Satchel
        </button>
        <button
          type="button"
          aria-pressed={journalOpen}
          onClick={() => setJournalOpen((open) => !open)}
        >
          Journal
        </button>
        <button type="button" aria-pressed={mapOpen} onClick={() => setMapOpen((open) => !open)}>
          Map
        </button>
        <button
          type="button"
          aria-pressed={collectionOpen}
          onClick={() => setCollectionOpen((open) => !open)}
        >
          Log
        </button>
        <button
          type="button"
          aria-pressed={profileOpen}
          onClick={() => (profileOpen ? closeProfile() : setProfileOpen(true))}
        >
          Profile
        </button>
      </nav>
      {satchelView === 'inventory' && (
        <InventoryPanel
          onClose={() => setSatchelView(null)}
          onOpenEquipment={() => setSatchelView('equipment')}
          onEquip={onEquip}
        />
      )}
      {satchelView === 'equipment' && (
        <EquipmentPanel onBack={() => setSatchelView('inventory')} onUnequip={onUnequip} />
      )}
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
      {openNoticeId !== null && (
        <NoticeBoard
          onAccept={onAcceptQuest}
          onComplete={onCompleteQuest}
          onClose={() => setOpenNotice(null)}
        />
      )}
      {openDialogue !== null && <NpcDialogue onClose={() => setOpenDialogue(null)} />}
    </div>
  );
}
