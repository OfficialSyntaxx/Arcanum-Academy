/**
 * Gathering nodes and their drop tables.
 *
 * A node definition binds a place in the world to what it yields. The
 * `interactableId` points at an `Interactable` already placed in a zone rather
 * than carrying its own coordinates: the world owns where things are, and
 * duplicating a position here would let the two disagree.
 *
 * Drop weights are integers. Floating-point weights are not reproducible across
 * platforms once summed in a different order, and reproducibility is the whole
 * basis of a seeded harvest replaying to an identical yield.
 */

import type { InteractableId, ItemDefinitionId, NodeId, SkillId } from '../ids.js';

export const GatheringNodeKind = {
  Crystal: 'CRYSTAL',
  Mushroom: 'MUSHROOM',
  Emberwood: 'EMBERWOOD',
} as const;
export type GatheringNodeKind = (typeof GatheringNodeKind)[keyof typeof GatheringNodeKind];

export interface DropTableEntry {
  readonly itemId: ItemDefinitionId;
  /** Relative integer weight. Meaningful only against the table's total. */
  readonly weight: number;
  readonly minQuantity: number;
  readonly maxQuantity: number;
}

export interface NodeDefinition {
  readonly id: NodeId;
  /** Must name an `InteractableKind.GatheringNode` in the zone it belongs to. */
  readonly interactableId: InteractableId;
  readonly kind: GatheringNodeKind;
  readonly requiredSkillId: SkillId;
  readonly requiredSkillLevel: number;
  /** Milliseconds per harvest tick before tool and skill modifiers. */
  readonly harvestIntervalMs: number;
  readonly dropTable: readonly DropTableEntry[];
  readonly xpPerHarvest: number;
  /** Harvests before the node goes dormant. */
  readonly depletionHarvests: number;
  /** Milliseconds dormant before it may be worked again. */
  readonly regenerationMs: number;
}

/**
 * The runtime state of one node for one player.
 *
 * Depletion is tracked per player rather than globally: a shared node would
 * make the first player of the day strictly better off than the last, which is
 * a race the game has no reason to create.
 */
export interface NodeState {
  readonly harvestsSinceRegen: number;
  /** Wall-clock time the node becomes workable again, or null when it is. */
  readonly dormantUntilMs: number | null;
}
