/**
 * Animated presentation for every character in the zone.
 *
 * Named cast and anonymous crowd alike are the shared humanoid rig; the
 * instanced pool figure stands in only until a rig has loaded, so a cold
 * mobile start never shows an empty plaza.
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
  private disposed = false;

  constructor(
    private readonly world: WorldService,
    shadowsEnabled: boolean,
    named: readonly NamedNpcPresentation[],
  ) {
    this.root.name = 'named-npc-avatars';
    for (const presentation of named) {
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

  update(dtSeconds: number, named: readonly NamedNpcPresentation[]): void {
    if (this.disposed) return;
    for (const presentation of named) {
      const avatar = this.avatars.get(presentation.id);
      if (!avatar || !avatar.rig.ready) continue;
      if (!avatar.hidden) {
        // The pooled silhouette stood in during the load; hand over now.
        avatar.hidden = true;
        this.world.actors.setVisualVisible(avatar.slot, false);
      }
      avatar.rig.update(
        dtSeconds,
        {
          x: presentation.position.x,
          y: presentation.elevation,
          z: presentation.position.z,
        },
        presentation.facing,
        presentation.gait,
        actionFor(presentation.activity, presentation.gait),
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const avatar of this.avatars.values()) {
      avatar.rig.dispose();
      this.world.actors.setVisualVisible(avatar.slot, true);
    }
    this.avatars.clear();
    this.root.clear();
  }
}
