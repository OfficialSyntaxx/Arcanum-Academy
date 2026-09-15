import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES } from '@alderfell/shared';
import { applyDiscovery } from '../domain/diaries.js';
import { createInitialState } from '../domain/player-state.js';

describe('diary reward settlement', () => {
  it('persists one receipt and never pays a completed diary twice', () => {
    let state = createInitialState(DEFAULT_TUNABLES.gathering.baseInventorySlots, 0);
    for (const source of [
      'node.courtyard.mushroom',
      'node.courtyard.crystal',
      'node.courtyard.emberwood',
      'node.courtyard.tidepool',
    ]) {
      state = applyDiscovery(state, source, 10, DEFAULT_TUNABLES.economy.currencyCap);
    }
    expect(state.coins).toBe(15);
    expect(state.diaryRewards['diary.shorelands.gatherer']).toEqual({ paidAtMs: 10 });
    const repeated = applyDiscovery(
      state,
      'node.courtyard.tidepool',
      20,
      DEFAULT_TUNABLES.economy.currencyCap,
    );
    expect(repeated.coins).toBe(15);
    expect(repeated.diaryRewards).toBe(state.diaryRewards);
  });

  it('settles a newly introduced diary for an existing discovery ledger', () => {
    const base = createInitialState(DEFAULT_TUNABLES.gathering.baseInventorySlots, 0);
    const completeLedger = {
      ...base,
      discoveries: Object.fromEntries(
        [
          'discovery.gather.mushrooms',
          'discovery.gather.crystal',
          'discovery.gather.emberwood',
          'discovery.gather.tidepool',
        ].map((id) => [id, { unlockedAtMs: 1 }]),
      ),
    };
    const settled = applyDiscovery(
      completeLedger,
      'node.courtyard.crystal',
      20,
      DEFAULT_TUNABLES.economy.currencyCap,
    );
    expect(settled.coins).toBe(15);
    expect(settled.diaryRewards['diary.shorelands.gatherer']).toEqual({ paidAtMs: 20 });
  });
});
