import { describe, expect, it } from 'vitest';
import { DEFAULT_TUNABLES, TIDEGLASS_TRAIL, asId, type PlayerId } from '@alderfell/shared';
import {
  createInitialState,
  parsePlayerState,
  serialisePlayerState,
} from '../domain/player-state.js';

const SLOTS = DEFAULT_TUNABLES.gathering.baseInventorySlots;

function roundTrip(step: number): number {
  const base = createInitialState(SLOTS, 0);
  const state = {
    ...base,
    tideglassTrail: { startedAtMs: 1, step, completedAtMs: null, rewardClaimed: false },
  };
  const parsed = parsePlayerState(
    {
      playerId: asId<PlayerId>('clue-player'),
      schemaVersion: 9,
      version: 1,
      data: serialisePlayerState(state),
      updatedAtMs: 0,
    },
    SLOTS,
  );
  if (!parsed.ok) throw new Error(parsed.error.reason);
  return parsed.value.tideglassTrail.step;
}

describe('treasure trail persistence', () => {
  it('stores progress at every authored step of the trail', () => {
    // This clamped to a literal 4 while the trail had four steps. Extending the
    // trail then lost every step past the fourth *silently*: the handler
    // returned success, the write was clamped away on read, and the player was
    // sent back to a bearing they had already inspected. Nothing failed.
    for (let step = 0; step <= TIDEGLASS_TRAIL.steps.length; step += 1) {
      expect(roundTrip(step), `step ${String(step)}`).toBe(step);
    }
  });

  it('still clamps a stored step beyond the trail', () => {
    // Which is what should happen if the trail is ever shortened.
    expect(roundTrip(TIDEGLASS_TRAIL.steps.length + 5)).toBe(TIDEGLASS_TRAIL.steps.length);
  });
});
