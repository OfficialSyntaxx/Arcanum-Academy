import { describe, expect, it } from 'vitest';
import { QualityTier, resolveQuality, type DeviceSignals } from '../core/device.js';

const baseline: DeviceSignals = {
  hardwareConcurrency: 4,
  deviceMemoryGb: 4,
  devicePixelRatio: 3,
  maxTextureSize: 4096,
  isTouchPrimary: true,
  prefersReducedMotion: false,
  prefersReducedData: false,
};

describe('quality tiering', () => {
  it('places a mid-range phone on the medium tier', () => {
    expect(resolveQuality(baseline).tier).toBe(QualityTier.Medium);
  });

  it('promotes a capable device', () => {
    const quality = resolveQuality({
      ...baseline,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      maxTextureSize: 16_384,
    });
    expect(quality.tier).toBe(QualityTier.High);
    expect(quality.shadowsEnabled).toBe(true);
  });

  it('demotes a constrained device', () => {
    const quality = resolveQuality({
      ...baseline,
      hardwareConcurrency: 2,
      deviceMemoryGb: 2,
      maxTextureSize: 2048,
    });
    expect(quality.tier).toBe(QualityTier.Low);
    expect(quality.antialias).toBe(false);
    expect(quality.maxAmbientActors).toBeLessThan(10);
  });

  it('respects a data-saving preference even on strong hardware', () => {
    const quality = resolveQuality({
      ...baseline,
      hardwareConcurrency: 8,
      deviceMemoryGb: 8,
      maxTextureSize: 16_384,
      prefersReducedData: true,
    });
    expect(quality.tier).toBe(QualityTier.Medium);
  });

  it('caps pixel ratio well below a phone screen native value', () => {
    expect(resolveQuality(baseline).pixelRatio).toBeLessThanOrEqual(1.5);
    expect(resolveQuality({ ...baseline, devicePixelRatio: 1 }).pixelRatio).toBe(1);
  });

  it('treats unreported memory as mid-range rather than as zero', () => {
    expect(resolveQuality({ ...baseline, deviceMemoryGb: null }).tier).toBe(QualityTier.Medium);
  });

  it('lowers the frame target when motion is reduced', () => {
    expect(resolveQuality({ ...baseline, prefersReducedMotion: true }).targetFps).toBe(30);
  });
});
