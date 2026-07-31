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
}));
