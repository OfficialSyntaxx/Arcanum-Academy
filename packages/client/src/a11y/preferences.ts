/**
 * Accessibility preferences.
 *
 * Pulled forward from Phase 8 deliberately. Text scaling and reduced motion are
 * cheap to honour while the UI is three screens and expensive once it is thirty,
 * because by then the assumptions are baked into every layout. Building the
 * switches now costs a day; retrofitting them costs a milestone.
 *
 * Preferences seed from the operating system — a player who has already told
 * their phone they want less motion should not have to tell us as well — and can
 * then be overridden explicitly.
 */

export interface AccessibilityPreferences {
  /** Suppresses camera easing, idle animation and non-essential transitions. */
  readonly reducedMotion: boolean;
  /** Multiplier applied to the UI's root font size, 1 to 1.5. */
  readonly textScale: number;
  /** Raises contrast and removes translucency behind text. */
  readonly highContrast: boolean;
  /**
   * Adds a redundant non-colour channel — icon shape, label — anywhere colour
   * carries meaning. Card schools and grade bands both rely on colour, so this
   * matters more here than in most games.
   */
  readonly colourBlindSafe: boolean;
  /** Prompts and dialogue stay on screen until dismissed rather than timing out. */
  readonly persistentPrompts: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilityPreferences = {
  reducedMotion: false,
  textScale: 1,
  highContrast: false,
  colourBlindSafe: false,
  persistentPrompts: false,
};

export const MIN_TEXT_SCALE = 1;
export const MAX_TEXT_SCALE = 1.5;

export interface MediaQueryReader {
  matches(query: string): boolean;
}

export const browserMediaQueryReader: MediaQueryReader = {
  matches(query: string): boolean {
    return typeof window !== 'undefined' && window.matchMedia(query).matches;
  },
};

/** Seeds preferences from OS-level settings. */
export function readSystemPreferences(
  reader: MediaQueryReader = browserMediaQueryReader,
): AccessibilityPreferences {
  return {
    ...DEFAULT_ACCESSIBILITY,
    reducedMotion: reader.matches('(prefers-reduced-motion: reduce)'),
    highContrast: reader.matches('(prefers-contrast: more)'),
  };
}

export function clampTextScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1;
  return Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, scale));
}

/**
 * The subset of an element these preferences touch. Depending on the shape
 * rather than on `HTMLElement` keeps the module testable without a DOM and
 * documents exactly what it mutates.
 */
export interface PreferenceTarget {
  readonly style: { setProperty(name: string, value: string): void };
  readonly dataset: Record<string, string | undefined>;
}

/**
 * Projects preferences onto the document root as data attributes and a custom
 * property. The stylesheet reads them; no component needs to know a preference
 * exists, which is what stops accessibility from becoming a prop threaded
 * through every layer of the tree.
 */
export function applyAccessibility(
  preferences: AccessibilityPreferences,
  root: PreferenceTarget,
): void {
  root.style.setProperty('--text-scale', String(clampTextScale(preferences.textScale)));
  root.dataset['reducedMotion'] = String(preferences.reducedMotion);
  root.dataset['highContrast'] = String(preferences.highContrast);
  root.dataset['colourBlindSafe'] = String(preferences.colourBlindSafe);
}

/**
 * Camera and animation smoothing factor. Returns 1 under reduced motion, which
 * makes every eased transition resolve in a single frame without any caller
 * needing a branch.
 */
export function motionScale(preferences: AccessibilityPreferences): number {
  return preferences.reducedMotion ? 1 : 0;
}
