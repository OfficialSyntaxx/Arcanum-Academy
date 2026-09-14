import { describe, expect, it } from 'vitest';

import { WeatherKind, weatherForDay } from '../world/weather.js';

describe('presentation weather', () => {
  it('is deterministic for a world day', () => {
    expect(weatherForDay(42)).toEqual(weatherForDay(42));
  });

  it('keeps weather presentation-only and within readable visibility bounds', () => {
    for (let day = 0; day < 128; day += 1) {
      const weather = weatherForDay(day);
      expect(weather.fogNearScale).toBeGreaterThanOrEqual(0.65);
      expect(weather.fogFarScale).toBeGreaterThanOrEqual(0.75);
      expect(weather.rainOpacity).toBeLessThanOrEqual(0.35);
    }
  });

  it('provides clear, mist, and rain conditions over a repeatable run of days', () => {
    const kinds = new Set(Array.from({ length: 128 }, (_, day) => weatherForDay(day).kind));
    expect(kinds).toEqual(new Set([WeatherKind.Clear, WeatherKind.Mist, WeatherKind.Rain]));
  });
});
