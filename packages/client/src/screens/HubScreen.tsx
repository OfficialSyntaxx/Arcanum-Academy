import { useEffect, useState } from 'react';
import { HubHud, InteractionPrompt } from '../ui/HubOverlay.js';
import { JoystickPad } from '../ui/JoystickPad.js';
import { CommandError, CraftingPanel, GatheringHud, InventoryPanel } from '../ui/EconomyPanels.js';
import { CollectionPanel } from '../ui/CollectionPanel.js';
import { LadderPanel, TradePanel } from '../ui/SocialPanels.js';
import { DuelScreen } from '../ui/DuelScreen.js';
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
  readonly onSaveDeck: (deckId: string, name: string, cardDefinitionIds: string[]) => void;
  readonly onScribe: (cardId: string) => void;
  readonly onDeleteDeck: (deckId: string) => void;
  readonly onStartDuel: (deckId: string, difficulty: string) => void;
  readonly onDuelAct: (command: string, handIndex?: number) => void;
  readonly onForfeitDuel: () => void;
  readonly playerId: string;
  readonly onQueue: (deckId: string) => void;
  readonly onLeaveQueue: () => void;
  readonly onPvpAct: (matchId: string, command: string, handIndex?: number) => void;
  readonly onForfeitPvp: (matchId: string) => void;
  readonly onTradeOffer: (
    tradeId: string,
    stacks: { definitionId: string; quantity: number }[],
    cardInstanceIds: string[],
  ) => void;
  readonly onTradeConfirm: (tradeId: string) => void;
  readonly onTradeCancel: (tradeId: string) => void;
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
  onSaveDeck,
  onScribe,
  onDeleteDeck,
  onStartDuel,
  onDuelAct,
  onForfeitDuel,
  playerId,
  onQueue,
  onLeaveQueue,
  onPvpAct,
  onForfeitPvp,
  onTradeOffer,
  onTradeConfirm,
  onTradeCancel,
}: HubScreenProps) {
  const gatheringNodeId = useAppStore((state) => state.economy.gatheringNodeId);
  const openStationId = useAppStore((state) => state.openStationId);
  const setOpenStation = useAppStore((state) => state.setOpenStation);
  const duel = useAppStore((state) => state.duel);
  const pvp = useAppStore((state) => state.pvp);
  const trade = useAppStore((state) => state.trade);
  const ladderOpen = useAppStore((state) => state.ladderOpen);
  const setLadderOpen = useAppStore((state) => state.setLadderOpen);
  const setPvp = useAppStore((state) => state.setPvp);
  const setDuel = useAppStore((state) => state.setDuel);
  const decks = useAppStore((state) => state.economy.decks);
  const collectionOpen = useAppStore((state) => state.collectionOpen);
  const setCollectionOpen = useAppStore((state) => state.setCollectionOpen);

  useEffect(() => {
    if (gatheringNodeId === null) return;
    const timer = setInterval(onCollect, COLLECTION_POLL_MS);
    return () => clearInterval(timer);
  }, [gatheringNodeId, onCollect]);

  // The satchel is a panel rather than a permanent strip: it is consulted
  // occasionally and would otherwise cost screen the world should be using.
  const [satchelOpen, setSatchelOpen] = useState(false);

  // A duel takes the whole surface. The hub is still there underneath, but a
  // duel with a joystick and a satchel button over it is neither one thing nor
  // the other on a phone.
  // A ladder duel takes the same surface as an AI one; only where the commands
  // go differs, which is the point of the engine being seat-agnostic.
  if (pvp !== null) {
    return (
      <DuelScreen
        duel={pvp}
        onAct={(command, handIndex) => onPvpAct(pvp.matchId, command, handIndex)}
        onForfeit={() => onForfeitPvp(pvp.matchId)}
        onLeave={() => setPvp(null)}
      />
    );
  }

  if (duel !== null) {
    return (
      <DuelScreen
        duel={duel}
        onAct={onDuelAct}
        onForfeit={onForfeitDuel}
        onLeave={() => setDuel(null)}
      />
    );
  }

  const firstDeckId = Object.keys(decks)[0];

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
      {firstDeckId !== undefined && (
        <button
          type="button"
          className="duel-start"
          onClick={() => onStartDuel(firstDeckId, 'ADEPT')}
        >
          Duel
        </button>
      )}
      {ladderOpen && (
        <LadderPanel
          deckId={firstDeckId}
          onQueue={onQueue}
          onLeaveQueue={onLeaveQueue}
          onClose={() => setLadderOpen(false)}
        />
      )}
      {trade !== null && (
        <TradePanel
          playerId={playerId}
          onOffer={onTradeOffer}
          onConfirm={onTradeConfirm}
          onCancel={onTradeCancel}
        />
      )}
      <CommandError />
      {collectionOpen && (
        <CollectionPanel
          onScribe={onScribe}
          onSaveDeck={onSaveDeck}
          onDeleteDeck={onDeleteDeck}
          onClose={() => setCollectionOpen(false)}
        />
      )}
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
