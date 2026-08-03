import { create } from 'zustand';
import type { GamePhase } from '@arcanum/sim';
import type { QualityTier } from '../core/device.js';
import type { TransportStatus } from '../net/transport.js';
import { DEFAULT_ACCESSIBILITY, type AccessibilityPreferences } from '../a11y/preferences.js';

/**
 * UI-facing state.
 *
 * Deliberately separate from the simulation. The simulation is authoritative,
 * deterministic and framework-free; this store is a projection of it plus
 * presentation concerns (which panel is open, is the connection banner showing).
 * Keeping the boundary sharp means React re-renders can never perturb game
 * state, and the simulation can run in a worker later without touching the UI.
 */

export interface BootStep {
  readonly id: string;
  readonly label: string;
  readonly status: 'pending' | 'active' | 'done' | 'failed';
  readonly detail?: string;
}

/** The interactable the player is currently standing next to, if any. */
export interface InteractionPromptState {
  readonly id: string;
  readonly label: string;
  readonly verb: string;
  readonly kind: string;
  readonly approach: string;
}

/**
 * The economy as the client believes it to be.
 *
 * Every field here is a projection of what the server last confirmed, never a
 * local calculation. Gathering yields are resolved server-side and arrive as a
 * patch, so nothing in this slice can drift from the authoritative record.
 */
export interface EconomyState {
  readonly stacks: readonly { definitionId: string; quantity: number }[];
  readonly slotCapacity: number;
  readonly skills: Readonly<Record<string, { level: number; xp: number }>>;
  /** The node being worked, or null when nothing is running. */
  readonly gatheringNodeId: string | null;
  /** Yields from the most recent collection, for a transient readout. */
  readonly lastYields: readonly { itemId: string; quantity: number }[];
  readonly lastXpGained: number;
  /** True when the last collection lost materials to a full bag. */
  readonly overflowed: boolean;
  /** The collection: every card scribed, not a deck. */
  readonly cards: readonly {
    definitionId: string;
    grade: number;
    foil: boolean;
    serial: string | null;
  }[];
  readonly decks: Readonly<Record<string, { name: string; cardDefinitionIds: readonly string[] }>>;
}

export const EMPTY_ECONOMY: EconomyState = {
  stacks: [],
  slotCapacity: 0,
  skills: {},
  gatheringNodeId: null,
  lastYields: [],
  lastXpGained: 0,
  overflowed: false,
  cards: [],
  decks: {},
};

/**
 * The duel as the server last reported it.
 *
 * The opponent's hand is a count, never a list. That is enforced server-side
 * too, but the client type says so as well so nobody adds a renderer for cards
 * that were deliberately never sent.
 */
export interface DuelView {
  readonly turn: number;
  readonly active: number;
  readonly outcome: { readonly winner: number | null; readonly reason: string } | null;
  readonly log: readonly string[];
  readonly you: {
    readonly life: number;
    readonly ward: number;
    readonly resonance: number;
    readonly hand: readonly string[];
    readonly board: readonly { readonly definitionId: string }[];
    readonly deck: number;
  };
  readonly opponent: {
    readonly life: number;
    readonly ward: number;
    readonly resonance: number;
    readonly board: readonly { readonly definitionId: string }[];
    readonly handCount: number;
    readonly deck: number;
  };
}

/** A trade as the server last reported it. */
export interface TradeView {
  readonly id: string;
  readonly participants: readonly string[];
  readonly offers: Readonly<
    Record<
      string,
      {
        readonly stacks: readonly { definitionId: string; quantity: number }[];
        readonly cardInstanceIds: readonly string[];
        readonly confirmed: boolean;
      }
    >
  >;
  readonly state: string;
  readonly ledger: readonly string[];
}

/** A ladder duel. Distinct from `DuelView`: it carries the seat and match id. */
export interface PvpView extends DuelView {
  readonly matchId: string;
  readonly seat: number;
  readonly yourTurn: boolean;
}

export interface AppState {
  readonly phase: GamePhase;
  readonly bootSteps: readonly BootStep[];
  readonly transportStatus: TransportStatus;
  readonly latencyMs: number | null;
  readonly qualityTier: QualityTier | null;
  readonly fps: number;
  readonly simulationTick: number;
  readonly faultMessage: string | null;
  readonly updateAvailable: boolean;
  readonly interactionPrompt: InteractionPromptState | null;
  /** Minute of the in-world day, 0-1439. */
  readonly worldMinute: number;
  readonly ambientPopulation: number;
  readonly accessibility: AccessibilityPreferences;
  readonly economy: EconomyState;
  /** Reason string of the last refused command, cleared when one succeeds. */
  readonly lastCommandError: string | null;
  /** The crafting station whose recipes are open, or null. */
  readonly openStationId: string | null;
  readonly collectionOpen: boolean;
  readonly ladderOpen: boolean;
  /** This player's id, as the server reported it at handshake. */
  readonly playerId: string;
  readonly duel: DuelView | null;
  readonly trade: TradeView | null;
  readonly pvp: PvpView | null;
  /** Non-null while waiting for the ladder to pair you. */
  readonly queued: { readonly queueSize: number } | null;

  setPhase(phase: GamePhase): void;
  setBootStep(id: string, patch: Partial<Omit<BootStep, 'id'>>): void;
  registerBootSteps(steps: readonly BootStep[]): void;
  setTransportStatus(status: TransportStatus): void;
  setLatency(ms: number): void;
  setQualityTier(tier: QualityTier): void;
  setFrameStats(fps: number, simulationTick: number): void;
  setFault(message: string | null): void;
  setUpdateAvailable(available: boolean): void;
  setInteractionPrompt(prompt: InteractionPromptState | null): void;
  setWorldMinute(minute: number): void;
  setAmbientPopulation(count: number): void;
  setAccessibility(patch: Partial<AccessibilityPreferences>): void;
  setEconomy(patch: Partial<EconomyState>): void;
  setLastCommandError(reason: string | null): void;
  setOpenStation(interactableId: string | null): void;
  setCollectionOpen(open: boolean): void;
  setLadderOpen(open: boolean): void;
  setPlayerId(playerId: string): void;
  setDuel(duel: DuelView | null): void;
  setTrade(trade: TradeView | null): void;
  setPvp(pvp: PvpView | null): void;
  setQueued(queued: { queueSize: number } | null): void;
}

export const useAppStore = create<AppState>((set) => ({
  phase: 'BOOT' as GamePhase,
  bootSteps: [],
  transportStatus: 'idle' as TransportStatus,
  latencyMs: null,
  qualityTier: null,
  fps: 0,
  simulationTick: 0,
  faultMessage: null,
  updateAvailable: false,
  interactionPrompt: null,
  worldMinute: 0,
  ambientPopulation: 0,
  accessibility: DEFAULT_ACCESSIBILITY,
  economy: EMPTY_ECONOMY,
  lastCommandError: null,
  openStationId: null,
  collectionOpen: false,
  ladderOpen: false,
  playerId: '',
  duel: null,
  trade: null,
  pvp: null,
  queued: null,

  setPhase: (phase) => set({ phase }),
  registerBootSteps: (steps) => set({ bootSteps: steps }),
  setBootStep: (id, patch) =>
    set((state) => ({
      bootSteps: state.bootSteps.map((step) => (step.id === id ? { ...step, ...patch } : step)),
    })),
  setTransportStatus: (transportStatus) => set({ transportStatus }),
  setLatency: (latencyMs) => set({ latencyMs }),
  setQualityTier: (qualityTier) => set({ qualityTier }),
  setFrameStats: (fps, simulationTick) => set({ fps, simulationTick }),
  setFault: (faultMessage) => set({ faultMessage }),
  setUpdateAvailable: (updateAvailable) => set({ updateAvailable }),
  setInteractionPrompt: (interactionPrompt) => set({ interactionPrompt }),
  setWorldMinute: (worldMinute) => set({ worldMinute }),
  setAmbientPopulation: (ambientPopulation) => set({ ambientPopulation }),
  setAccessibility: (patch) =>
    set((state) => ({ accessibility: { ...state.accessibility, ...patch } })),
  setEconomy: (patch) => set((state) => ({ economy: { ...state.economy, ...patch } })),
  setLastCommandError: (lastCommandError) => set({ lastCommandError }),
  setOpenStation: (openStationId) => set({ openStationId }),
  setCollectionOpen: (collectionOpen) => set({ collectionOpen }),
  setLadderOpen: (ladderOpen) => set({ ladderOpen }),
  setPlayerId: (playerId) => set({ playerId }),
  setDuel: (duel) => set({ duel }),
  setTrade: (trade) => set({ trade }),
  setPvp: (pvp) => set({ pvp }),
  setQueued: (queued) => set({ queued }),
}));
