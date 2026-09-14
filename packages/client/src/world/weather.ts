/**
 * Presentation-only weather selection.
 *
 * Weather is derived from the in-world day number rather than Math.random(),
 * so it cannot flicker during a session, change due to frame rate, or become a
 * hidden gameplay input. There are deliberately no combat, gathering, or
 * movement modifiers here.
 */

export const WeatherKind = {
  Clear: 'clear',
  Mist: 'mist',
  Rain: 'rain',
} as const;

export type WeatherKind = (typeof WeatherKind)[keyof typeof WeatherKind];

export interface WeatherConditions {
  readonly kind: WeatherKind;
  /** Colour grading mixed into the zone's authored sky and fog. */
  readonly skyTint: number;
  readonly fogTint: number;
  /** Multipliers keep the authored zone's visibility range in control. */
  readonly fogNearScale: number;
  readonly fogFarScale: number;
  readonly sunScale: number;
  readonly ambientScale: number;
  readonly rainOpacity: number;
}

const CLEAR: WeatherConditions = {
  kind: WeatherKind.Clear,
  skyTint: 0x9fcbe0,
  fogTint: 0xa4b878,
  fogNearScale: 1,
  fogFarScale: 1,
  sunScale: 1,
  ambientScale: 1,
  rainOpacity: 0,
};

const MIST: WeatherConditions = {
  kind: WeatherKind.Mist,
  skyTint: 0xb4c5c5,
  fogTint: 0xb0b7a1,
  fogNearScale: 0.68,
  fogFarScale: 0.78,
  sunScale: 0.86,
  ambientScale: 1.06,
  rainOpacity: 0,
};

const RAIN: WeatherConditions = {
  kind: WeatherKind.Rain,
  skyTint: 0x75899b,
  fogTint: 0x82919a,
  fogNearScale: 0.78,
  fogFarScale: 0.88,
  sunScale: 0.68,
  ambientScale: 0.94,
  rainOpacity: 0.32,
};

/** Deterministic day-level weather with clear conditions as the common case. */
export function weatherForDay(dayNumber: number): WeatherConditions {
  // A small integer hash avoids a persistent seed or any simulation dependency.
  const mixed = Math.imul(Math.trunc(dayNumber), 1_103_515_245) + 12_345;
  const roll = (mixed >>> 0) / 0x1_0000_0000;
  if (roll < 0.16) return RAIN;
  if (roll < 0.34) return MIST;
  return CLEAR;
}
