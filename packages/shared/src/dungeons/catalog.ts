export interface SaltwakeProgress {
  readonly enteredAtMs: number | null;
  readonly galleryCleared: boolean;
  readonly bossDefeated: boolean;
  readonly chestClaimed: boolean;
  readonly shortcutUnlocked: boolean;
}

export const EMPTY_SALTWAKE_PROGRESS: SaltwakeProgress = Object.freeze({
  enteredAtMs: null,
  galleryCleared: false,
  bossDefeated: false,
  chestClaimed: false,
  shortcutUnlocked: false,
});
