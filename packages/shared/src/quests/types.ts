/** Server-owned progress for one authored quest. */
export const QuestStatus = {
  Active: 'ACTIVE',
  Completed: 'COMPLETED',
} as const;

export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus];

export interface QuestProgress {
  readonly status: QuestStatus;
  readonly acceptedAtMs: number;
  readonly completedAtMs: number | null;
  /** Confirmed non-inventory objectives, keyed by the authored objective id. */
  readonly objectiveCounts: Readonly<Record<string, number>>;
}
