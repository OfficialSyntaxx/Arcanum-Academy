/**
 * The player's body: the shared humanoid rig in the hooded ranger outfit.
 *
 * The procedural pool actor stays visible until the rig has loaded, so a cold
 * mobile start never shows an empty spot where the player should be.
 */
import { CHARACTER_HEIGHT, CharacterRig, type CharacterAction } from './character-rig.js';

/** Reference height every other figure and creature is held against. */
export const PLAYER_DISPLAY_HEIGHT = CHARACTER_HEIGHT;

export class PlayerAvatar {
  private readonly rig: CharacterRig;

  constructor(shadowsEnabled: boolean, onReady: () => void) {
    this.rig = new CharacterRig('ranger-m', { shadowsEnabled, onReady });
    this.rig.root.name = 'player-avatar';
  }

  get root() {
    return this.rig.root;
  }

  get ready(): boolean {
    return this.rig.ready;
  }

  update(
    dtSeconds: number,
    position: { readonly x: number; readonly y: number; readonly z: number },
    facing: number,
    gait: number,
    action: CharacterAction,
  ): void {
    this.rig.update(dtSeconds, position, facing, gait, action);
  }

  dispose(): void {
    this.rig.dispose();
  }
}
