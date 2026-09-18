import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { initialProgress } from '@alderfell/sim';
import { DIARY_CATALOG, SKILL_TABLE, type SkillProgress } from '@alderfell/shared';
import { parsePlayerState } from './domain/player-state.js';
import type { PlayerRepository } from './persistence/repository.js';

const MAX_RESULTS = 25;

interface PublicProfile {
  readonly publicId: string;
  readonly displayName: string;
  readonly totalLevel: number;
  readonly totalXp: number;
  readonly combatLevel: number;
  readonly updatedAtMs: number;
}

interface PublicProfileDetail extends PublicProfile {
  readonly skills: readonly {
    readonly name: string;
    readonly level: number;
    readonly xp: number;
  }[];
  readonly diaryHighlights: readonly string[];
  readonly discoveries: number;
}

export function registerPublicProfileRoutes(
  app: FastifyInstance,
  options: {
    readonly repository: PlayerRepository;
    readonly slotCapacity: number;
    readonly allowedOrigins: readonly string[];
  },
): void {
  const allow = (request: FastifyRequest, reply: FastifyReply): boolean => {
    const origin = request.headers.origin;
    if (typeof origin === 'string' && options.allowedOrigins.includes(origin)) {
      reply.header('access-control-allow-origin', origin).header('vary', 'Origin');
    }
    return true;
  };
  app.options('/profiles/*', async (request, reply) => {
    allow(request, reply);
    return reply.header('access-control-allow-methods', 'GET, OPTIONS').code(204).send();
  });
  app.get('/profiles/hiscores', async (request, reply) => {
    allow(request, reply);
    const records = await options.repository.listPlayers({ limit: 1000 });
    if (!records.ok) return reply.code(503).send({ error: 'unavailable' });
    const profiles = records.value.records
      .flatMap((record) => {
        const parsed = parsePlayerState(record, options.slotCapacity);
        if (
          !parsed.ok ||
          !parsed.value.profile.isPublic ||
          !parsed.value.profile.displayName ||
          !parsed.value.profile.publicId
        )
          return [];
        return [
          project(
            parsed.value.profile.publicId,
            parsed.value.profile.displayName,
            parsed.value.skills,
            record.updatedAtMs,
          ),
        ];
      })
      .sort(
        (a, b) =>
          b.totalXp - a.totalXp ||
          b.totalLevel - a.totalLevel ||
          a.displayName.localeCompare(b.displayName),
      )
      .slice(0, MAX_RESULTS)
      .map((profile, index) => ({ rank: index + 1, ...profile }));
    return reply.header('cache-control', 'public, max-age=30').send({ hiscores: profiles });
  });
  app.get('/profiles/:publicId', async (request, reply) => {
    allow(request, reply);
    const publicId = (request.params as { publicId?: string }).publicId;
    if (!publicId || !/^[A-Za-z0-9_-]{8,80}$/.test(publicId))
      return reply.code(404).send({ error: 'not_found' });
    const records = await options.repository.listPlayers({ limit: 1000 });
    if (!records.ok) return reply.code(503).send({ error: 'unavailable' });
    for (const record of records.value.records) {
      const parsed = parsePlayerState(record, options.slotCapacity);
      if (
        !parsed.ok ||
        !parsed.value.profile.isPublic ||
        parsed.value.profile.publicId !== publicId ||
        !parsed.value.profile.displayName
      )
        continue;
      const base = project(
        publicId,
        parsed.value.profile.displayName,
        parsed.value.skills,
        record.updatedAtMs,
      );
      const skills = SKILL_TABLE.skills.map((skill) => ({
        name: skill.name,
        ...progress(parsed.value.skills, skill.id),
      }));
      const diaryHighlights = DIARY_CATALOG.filter(
        (diary) => parsed.value.diaryRewards[diary.id] !== undefined,
      ).map((diary) => diary.title);
      const detail: PublicProfileDetail = {
        ...base,
        skills,
        diaryHighlights,
        discoveries: Object.keys(parsed.value.discoveries).length,
      };
      return reply.header('cache-control', 'public, max-age=30').send({ profile: detail });
    }
    return reply.code(404).send({ error: 'not_found' });
  });
}

function project(
  publicId: string,
  displayName: string,
  skills: Readonly<Record<string, SkillProgress>>,
  updatedAtMs: number,
): PublicProfile {
  const progress = (id: string) => skills[id] ?? initialProgress();
  const entries = Object.values(skills);
  const totalXp = entries.reduce((total, skill) => total + skill.xp, 0);
  const totalLevel =
    entries.reduce((total, skill) => total + skill.level, 0) + Math.max(0, 12 - entries.length);
  const combatLevel = Math.max(
    progress('skill.attack').level,
    progress('skill.strength').level,
    progress('skill.defence').level,
    progress('skill.hitpoints').level,
  );
  return { publicId, displayName, totalLevel, totalXp, combatLevel, updatedAtMs };
}

function progress(skills: Readonly<Record<string, SkillProgress>>, id: string) {
  const value = skills[id] ?? initialProgress();
  return { level: value.level, xp: value.xp };
}
