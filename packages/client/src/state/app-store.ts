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
}

export const EMPTY_ECONOMY: EconomyState = {
  stacks: [],
  slotCapacity: 0,
  skills: {},
  gatheringNodeId: null,
  lastYields: [],
  lastXpGained: 0,
  overflowed: false,
};

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
}));
