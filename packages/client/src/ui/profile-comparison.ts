import { DIARY_CATALOG, SKILL_TABLE, type SkillProgress } from '@alderfell/shared';

export interface PublicSkillProgress {
  readonly name: string;
  readonly level: number;
  readonly xp: number;
}

export interface PublicProfileComparisonInput {
  readonly totalLevel: number;
  readonly totalXp: number;
  readonly discoveries: number;
  readonly diaryHighlights: readonly string[];
  readonly skills: readonly PublicSkillProgress[];
}

export interface ProfileComparison {
  readonly totals: {
    readonly ownLevel: number;
    readonly otherLevel: number;
    readonly ownXp: number;
    readonly otherXp: number;
    readonly ownDiscoveries: number;
    readonly otherDiscoveries: number;
    readonly ownDiaries: number;
    readonly otherDiaries: number;
  };
  readonly skills: readonly {
    readonly name: string;
    readonly own: SkillProgress;
    readonly other: PublicSkillProgress;
  }[];
  readonly ownDiaryTitles: readonly string[];
}

/**
 * Joins a selected public record to the player's already-confirmed local
 * projection. The client never uploads its side of the comparison.
 */
export function comparePublicProfile(
  ownSkills: Readonly<Record<string, SkillProgress>>,
  ownDiscoveries: Readonly<Record<string, unknown>>,
  ownDiaryRewards: Readonly<Record<string, unknown>>,
  other: PublicProfileComparisonInput,
): ProfileComparison {
  const byName = new Map(other.skills.map((skill) => [skill.name, skill]));
  const skills = SKILL_TABLE.skills.map((definition) => {
    const own = ownSkills[definition.id] ?? { level: 1, xp: 0 };
    const otherSkill = byName.get(definition.name) ?? {
      name: definition.name,
      level: 1,
      xp: 0,
    };
    return { name: definition.name, own, other: otherSkill };
  });
  const ownDiaryTitles = DIARY_CATALOG.filter(
    (diary) => ownDiaryRewards[diary.id] !== undefined,
  ).map((diary) => diary.title);

  return {
    totals: {
      ownLevel: skills.reduce((total, skill) => total + skill.own.level, 0),
      otherLevel: other.totalLevel,
      ownXp: skills.reduce((total, skill) => total + skill.own.xp, 0),
      otherXp: other.totalXp,
      ownDiscoveries: Object.keys(ownDiscoveries).length,
      otherDiscoveries: other.discoveries,
      ownDiaries: ownDiaryTitles.length,
      otherDiaries: other.diaryHighlights.length,
    },
    skills,
    ownDiaryTitles,
  };
}
