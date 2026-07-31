import type { ComponentType } from 'react';
import { GamePhase } from '@arcanum/sim';
import { BootScreen } from './BootScreen.js';
import { FaultScreen } from './FaultScreen.js';
import { SystemsScreen } from './SystemsScreen.js';

/**
 * Phase-to-screen map.
 *
 * Routing is driven by the simulation's phase, not by a URL: the game is a
 * single surface and the phase machine already decides what is legal. Phases
 * without a screen yet resolve to the systems readout, which is honest about
 * what exists rather than showing an empty frame.
 */
export const SCREEN_REGISTRY: Partial<Record<GamePhase, ComponentType>> = {
  [GamePhase.Boot]: BootScreen,
  [GamePhase.Loading]: BootScreen,
  [GamePhase.Fault]: FaultScreen,
};

export function resolveScreen(phase: GamePhase): ComponentType {
  return SCREEN_REGISTRY[phase] ?? SystemsScreen;
}
