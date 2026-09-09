/** Warm honey stone and green foliage; UI uses Oakenfall timber and amber. */

export const Palette = {
  ink: 0x11161d,
  slate: 0x3f6f3b,
  slateRaised: 0xa87a47,
  haze: 0xf0dfb0,
  hazeDim: 0x8a785f,
  verdigris: 0x2bbbaa,
  /** Warm accent for navigation and landmarks. */
  gilt: 0xf0a62e,
  alarm: 0xd0524a,
  /** Still water — canals, ponds, river segments. Flat colour; flow lands later. */
  canal: 0x258db5,
  /** Walkway strips laid along waypoint links. */
  path: 0xe0c27e,
  /** Doors and roof timber. */
  wood: 0x5c3524,
  /** Lamps, torches, lanterns — warm decorative light, not a dynamic source. */
  flame: 0xffb15a,
} as const;

export interface Atmosphere {
  readonly sky: number;
  readonly fog: number;
  readonly fogNear: number;
  readonly fogFar: number;
  readonly sunColour: number;
  readonly sunIntensity: number;
  readonly ambientColour: number;
  readonly ambientIntensity: number;
}

/**
 * Atmosphere presets, selected by a zone's `atmosphere` key and then tinted
 * continuously by the world clock. Authoring a preset per time of day would be
 * more controllable, but it would also mean an artist has to touch content every
 * time the day length changes.
 */
const PRESETS: Readonly<Record<string, Atmosphere>> = {
  'courtyard.afternoon': {
    sky: 0x78b5c4,
    fog: 0x89a56c,
    fogNear: 155,
    fogFar: 300,
    sunColour: 0xffd18a,
    sunIntensity: 1.35,
    ambientColour: 0x86b7a8,
    ambientIntensity: 0.48,
  },
  'forest.canopy': {
    sky: 0x1f3327,
    fog: 0x223a2c,
    fogNear: 135,
    fogFar: 260,
    sunColour: 0xcfe8a8,
    sunIntensity: 0.85,
    ambientColour: 0x5f8f6c,
    ambientIntensity: 0.6,
  },
  'mountains.overcast': {
    sky: 0x3a3f47,
    fog: 0x40454d,
    fogNear: 155,
    fogFar: 310,
    sunColour: 0xd8dee6,
    sunIntensity: 0.95,
    ambientColour: 0x7c828c,
    ambientIntensity: 0.6,
  },
  'snow.overcast': {
    sky: 0xcbd9e6,
    fog: 0xd8e4ee,
    fogNear: 135,
    fogFar: 270,
    sunColour: 0xf3f8ff,
    sunIntensity: 1.05,
    ambientColour: 0xb9cbdc,
    ambientIntensity: 0.75,
  },
};

const FALLBACK: Atmosphere = PRESETS['courtyard.afternoon']!;

export function atmosphereFor(key: string): Atmosphere {
  return PRESETS[key] ?? FALLBACK;
}

/**
 * Sun elevation for a fraction of the in-world day, in radians above the
 * horizon. Peaks at midday, dips below zero overnight so the key light can be
 * swapped for the moon without a second code path.
 */
export function sunElevation(dayFraction: number): number {
  return Math.sin((dayFraction - 0.25) * Math.PI * 2) * (Math.PI / 2.4);
}

/** Daylight strength, 0 at night through 1 at noon, with a soft dawn and dusk. */
export function daylight(dayFraction: number): number {
  return Math.max(0, Math.sin((dayFraction - 0.25) * Math.PI * 2));
}
