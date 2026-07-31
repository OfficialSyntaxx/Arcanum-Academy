/**
 * Device capability probing and quality tiering.
 *
 * The target device is a mid-range Android phone on a warm battery, not a
 * desktop GPU. Rather than guess from the user agent - which lies and ages
 * badly - the tier is derived from signals the browser actually reports, and
 * every renderer setting is a function of the tier.
 */

export const QualityTier = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
} as const;

export type QualityTier = (typeof QualityTier)[keyof typeof QualityTier];

export interface DeviceSignals {
  readonly hardwareConcurrency: number;
  /** Reported RAM in GB. Absent on Safari, so treated as unknown, not as zero. */
  readonly deviceMemoryGb: number | null;
  readonly devicePixelRatio: number;
  readonly maxTextureSize: number;
  readonly isTouchPrimary: boolean;
  readonly prefersReducedMotion: boolean;
  /** True when the OS reports low power mode or a saveData connection hint. */
  readonly prefersReducedData: boolean;
}

export interface QualitySettings {
  readonly tier: QualityTier;
  /** Clamped pixel ratio. The single biggest lever on mobile GPU cost. */
  readonly pixelRatio: number;
  readonly shadowsEnabled: boolean;
  readonly antialias: boolean;
  /** Cap on simultaneously rendered ambient NPCs in the hub. */
  readonly maxAmbientActors: number;
  readonly particleBudget: number;
  readonly targetFps: number;
}

export function readDeviceSignals(win: Window = window): DeviceSignals {
  const nav = win.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  let maxTextureSize = 2048;
  try {
    const canvas = win.document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl) maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  } catch {
    // A blocked WebGL context is itself a signal: assume the conservative default.
  }
  return {
    hardwareConcurrency: nav.hardwareConcurrency || 4,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    devicePixelRatio: win.devicePixelRatio || 1,
    maxTextureSize,
    isTouchPrimary: win.matchMedia('(pointer: coarse)').matches,
    prefersReducedMotion: win.matchMedia('(prefers-reduced-motion: reduce)').matches,
    prefersReducedData:
      nav.connection?.saveData === true || win.matchMedia('(prefers-reduced-data: reduce)').matches,
  };
}

export function resolveQuality(signals: DeviceSignals): QualitySettings {
  const memory = signals.deviceMemoryGb ?? 4;
  let score = 0;
  if (signals.hardwareConcurrency >= 8) score += 2;
  else if (signals.hardwareConcurrency >= 4) score += 1;
  if (memory >= 8) score += 2;
  else if (memory >= 4) score += 1;
  if (signals.maxTextureSize >= 8192) score += 2;
  else if (signals.maxTextureSize >= 4096) score += 1;
  if (signals.prefersReducedData) score -= 2;

  const tier: QualityTier =
    score >= 5 ? QualityTier.High : score >= 3 ? QualityTier.Medium : QualityTier.Low;

  // Pixel ratio is capped hard: above ~2 the visual gain is invisible on a phone
  // while the fill cost is quadratic.
  const pixelRatioCap = tier === QualityTier.High ? 2 : tier === QualityTier.Medium ? 1.5 : 1;

  return {
    tier,
    pixelRatio: Math.min(signals.devicePixelRatio, pixelRatioCap),
    shadowsEnabled: tier === QualityTier.High,
    antialias: tier !== QualityTier.Low,
    maxAmbientActors: tier === QualityTier.High ? 24 : tier === QualityTier.Medium ? 14 : 6,
    particleBudget: tier === QualityTier.High ? 512 : tier === QualityTier.Medium ? 256 : 96,
    targetFps: signals.prefersReducedMotion ? 30 : 60,
  };
}
