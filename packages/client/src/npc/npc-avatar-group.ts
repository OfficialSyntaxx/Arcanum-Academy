/**
 * Animated presentation for the characters in a zone.
 *
 * The named cast always gets a full rig: they are who the player talks to.
 * The anonymous crowd shares a small pool of rigs that follow the nearest
 * members, and everyone else stays in the cheap instanced pool.
 *
 * That split is a budget decision, not an aesthetic one. Each rigged character
 * costs roughly eight draw calls, so rigging a whole 18-strong crowd put the
 * Courtyard near 190 draw calls against the §6.8.1 target of 100. Crowd rigs
 * are pooled per outfit so a rig only ever changes which person it represents,
 * never which body it is wearing, which would otherwise flicker.
 */

import { Group } from 'three';
import { NpcActivity, NpcRole } from '@alderfell/shared';

import {
  CharacterRig,
  type CharacterAction,
  type CharacterOutfit,
} from '../player/character-rig.js';
import type { WorldService } from '../world/world-service.js';
import type { NamedNpcPresentation } from './npc-director.js';

const COLOURS: Readonly<Record<string, number>> = {
  'robe.indigo': 0xadb8df,
  'robe.slate': 0xc4d7dd,
  'robe.crimson': 0xe0afb0,
  'coat.umber': 0xd6b78f,
  'apron.moss': 0xb7d5a9,
  'sash.gilt': 0xf2d794,
  'student.a': 0x9fb3c8,
  'student.b': 0x9cc4bd,
  'student.c': 0xb3aed0,
};

interface Avatar {
  readonly id: string;
  readonly slot: number;
  readonly rig: CharacterRig;
  hidden: boolean;
}

/** Crowd rigs per outfit. Two apiece reads as a populated square up close. */
const CROWD_RIGS_PER_OUTFIT = 2;

/** A rig that follows whichever nearby crowd member is assigned to it. */
interface CrowdRig {
  readonly rig: CharacterRig;
  readonly outfit: CharacterOutfit;
  /** The pool slot currently hidden behind this rig, or -1 when unassigned. */
  slot: number;
}

/** Which outfit a role wears. Scholars and wardens get the hooded ranger. */
function outfitFor(role: NpcRole, id: string): CharacterOutfit {
  if (role === NpcRole.Merchant) return 'peasant-m';
  if (role === NpcRole.Groundskeeper) return 'peasant-f';
  if (role === NpcRole.Student) {
    // A stable split of the crowd between the two peasant bodies.
    let hash = 0;
    for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
    return (hash & 1) === 0 ? 'peasant-m' : 'peasant-f';
  }
  return 'ranger-m';
}

/** What a scheduled activity looks like from across the plaza. */
function actionFor(activity: NpcActivity, gait: number): CharacterAction {
  if (gait > 0.08) return 'none';
  if (activity === NpcActivity.Tend) return 'harvest';
  if (activity === NpcActivity.Spar) return 'attack';
  return 'none';
}

export class NpcAvatarGroup {
  readonly root = new Group();
  private readonly avatars = new Map<string, Avatar>();
  private readonly crowd: CrowdRig[] = [];
  private disposed = false;

  constructor(
    private readonly world: WorldService,
    shadowsEnabled: boolean,
    named: readonly NamedNpcPresentation[],
  ) {
    this.root.name = 'named-npc-avatars';
    for (const outfit of ['peasant-m', 'peasant-f'] as const) {
      for (let i = 0; i < CROWD_RIGS_PER_OUTFIT; i += 1) {
        const rig = new CharacterRig(outfit, { shadowsEnabled });
        rig.root.name = `crowd-rig:${outfit}:${i}`;
        rig.root.visible = false;
        this.root.add(rig.root);
        this.crowd.push({ rig, outfit, slot: -1 });
      }
    }
    for (const presentation of named) {
      if (presentation.role === NpcRole.Student) continue;
      const rig = new CharacterRig(outfitFor(presentation.role, presentation.id), {
        shadowsEnabled,
        ...(COLOURS[presentation.appearance] !== undefined
          ? { tint: COLOURS[presentation.appearance] }
          : {}),
      });
      rig.root.name = `npc-avatar:${presentation.id}`;
      this.root.add(rig.root);
      this.avatars.set(presentation.id, {
        id: presentation.id,
        slot: presentation.slot,
        rig,
        hidden: false,
      });
    }
  }

  update(
    dtSeconds: number,
    presentations: readonly NamedNpcPresentation[],
    player: { readonly x: number; readonly z: number },
  ): void {
    if (this.disposed) return;
    for (const presentation of presentations) {
      const avatar = this.avatars.get(presentation.id);
      if (!avatar || !avatar.rig.ready) continue;
      if (!avatar.hidden) {
        // The pooled silhouette stood in during the load; hand over now.
        avatar.hidden = true;
        this.world.actors.setVisualVisible(avatar.slot, false);
      }
      this.drive(avatar.rig, presentation, dtSeconds);
    }
    this.updateCrowd(dtSeconds, presentations, player);
  }

  /**
   * Hands each crowd rig to the nearest unrigged student wearing its outfit.
   *
   * Everyone a rig is not covering goes back to the instanced pool the same
   * frame, so a person is always drawn exactly once.
   */
  private updateCrowd(
    dtSeconds: number,
    presentations: readonly NamedNpcPresentation[],
    player: { readonly x: number; readonly z: number },
  ): void {
    const students = presentations
      .filter((entry) => entry.role === NpcRole.Student)
      .map((entry) => ({
        entry,
        distance: Math.hypot(entry.position.x - player.x, entry.position.z - player.z),
      }))
      .sort((a, b) => a.distance - b.distance);
    const taken = new Set<string>();
    for (const crowd of this.crowd) {
      const match = students.find(
        (candidate) =>
          !taken.has(candidate.entry.id) &&
          outfitFor(candidate.entry.role, candidate.entry.id) === crowd.outfit,
      );
      if (match === undefined || !crowd.rig.ready) {
        if (crowd.slot >= 0) {
          this.world.actors.setVisualVisible(crowd.slot, true);
          crowd.slot = -1;
        }
        crowd.rig.root.visible = false;
        continue;
      }
      taken.add(match.entry.id);
      if (crowd.slot !== match.entry.slot) {
        if (crowd.slot >= 0) this.world.actors.setVisualVisible(crowd.slot, true);
        crowd.slot = match.entry.slot;
        this.world.actors.setVisualVisible(crowd.slot, false);
      }
      crowd.rig.root.visible = true;
      this.drive(crowd.rig, match.entry, dtSeconds);
    }
  }

  private drive(rig: CharacterRig, presentation: NamedNpcPresentation, dtSeconds: number): void {
    rig.update(
      dtSeconds,
      { x: presentation.position.x, y: presentation.elevation, z: presentation.position.z },
      presentation.facing,
      presentation.gait,
      actionFor(presentation.activity, presentation.gait),
    );
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) {
      avatar.rig.dispose();
      this.world.actors.setVisualVisible(avatar.slot, true);
    }
    for (const crowd of this.crowd) {
      crowd.rig.dispose();
      if (crowd.slot >= 0) this.world.actors.setVisualVisible(crowd.slot, true);
    }
    this.crowd.length = 0;
    this.avatars.clear();
    this.root.clear();
  }
}
