import { describe, expect, it } from 'vitest';

import {
  clearPublicProfileLink,
  publicProfileIdFromUrl,
  publicProfileLink,
} from '../ui/public-profile-link.js';

const profileId = 'Qe7bcH61_0Yx';

describe('public profile links', () => {
  it('creates a same-origin deep link carrying only an opaque public ID', () => {
    expect(publicProfileLink('https://arcanum-academy.netlify.app/?view=map#old', profileId)).toBe(
      `https://arcanum-academy.netlify.app/?view=map&profile=${profileId}`,
    );
  });

  it('accepts only a bounded opaque public ID and removes it without disturbing other query state', () => {
    expect(
      publicProfileIdFromUrl(`https://arcanum-academy.netlify.app/?profile=${profileId}`),
    ).toBe(profileId);
    expect(
      publicProfileIdFromUrl('https://arcanum-academy.netlify.app/?profile=not%20an%20id!'),
    ).toBe(null);
    expect(
      clearPublicProfileLink(`https://arcanum-academy.netlify.app/?profile=${profileId}&view=map`),
    ).toBe('https://arcanum-academy.netlify.app/?view=map');
  });
});
