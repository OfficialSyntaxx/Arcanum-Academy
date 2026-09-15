import { discoveryForSource, recordDiscovery, settleDiaryRewards } from '@alderfell/shared';
import type { PlayerState } from './player-state.js';

/** Applies one confirmed event and any newly earned diary reward atomically. */
export function applyDiscovery(
  state: PlayerState,
  sourceId: string,
  nowMs: number,
  currencyCap: number,
): PlayerState {
  const discoveries = recordDiscovery(state.discoveries, discoveryForSource(sourceId), nowMs);
  const settled = settleDiaryRewards(state.diaryRewards, discoveries, nowMs);
  if (discoveries === state.discoveries && settled.coins === 0) return state;
  return {
    ...state,
    discoveries,
    diaryRewards: settled.receipts,
    coins: Math.min(currencyCap, state.coins + settled.coins),
  };
}
