import { describe, expect, it } from 'vitest';
import { COLLECTION_LOG_COPY } from '../ui/CollectionLog.js';

describe('collection log world copy', () => {
  it('does not describe every discovery as belonging to the starting shore', () => {
    expect(COLLECTION_LOG_COPY).toEqual({
      eyebrow: 'Alderfell discoveries',
      diariesLabel: 'Alderfell diaries',
      hiddenHint: 'Keep exploring Alderfell.',
    });
  });
});
