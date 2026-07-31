/**
 * The 3D palette, kept in lockstep with `styles/tokens.css`.
 *
 * The world and the UI have to read as one artefact: a duel circle glowing a
 * different green from the button that starts the duel is the kind of small
 * incoherence that makes a game feel assembled rather than designed. These are
 * the same nine values the stylesheet uses, expressed as hex numbers for three.
 */

export const Palette = {
  ink: 0x11161d,
  slate: 0x1b2531,
  slateRaised: 0x24303f,
  haze: 0xc6cfd8,
  hazeDim: 0x8496a8,
  verdigris: 0x3fa88e,
  /** Reserved for grade 9-10 prestige, in the world as well as in the UI. */
  gilt: 0xc9a227,
  alarm: 0xd0524a,
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
    sky: 0x2a3849,
    fog: 0x24303f,
    fogNear: 34,
    fogFar: 96,
    sunColour: 0xffe9c4,
    sunIntensity: 1.15,
    ambientColour: 0x8fa6c0,
    ambientIntensity: 0.55,
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
