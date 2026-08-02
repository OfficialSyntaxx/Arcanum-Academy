/**
 * Content validation and compilation.
 *
 * Authored content is a list of records; content in use is an indexed catalog.
 * Building one from the other is where authoring mistakes are caught - a recipe
 * consuming an item nobody defined, a node bound to an interactable that was
 * renamed, a drop table whose weights sum to nothing. This runs in a test over
 * the shipped files, so bad content fails CI rather than a player's harvest.
 *
 * The same shape as `buildNavGraph`, deliberately: structural problems are
 * gathered and reported together because someone fixing content wants the whole
 * list, not one error per run. Categorically different failures - an empty
 * catalog, a duplicate id - return on their own so the reason code stays
 * precise.
 *
 * Catalogs are built in dependency order. Skills resolve first because items
 * bind tools to them, then items, then nodes and recipes which reference both.
 * Anything else would mean validating against a half-built world.
 */

import { failure, type Failure } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { InteractableId, ItemDefinitionId, NodeId, RecipeId, SkillId } from '../ids.js';
import { ItemCategory, ItemRarity, type ItemDefinition } from '../items/types.js';
import { GatheringNodeKind, type NodeDefinition } from '../gathering/types.js';
import type { RecipeDefinition } from '../crafting/types.js';
import { SkillCategory, type SkillDefinition } from '../skills/types.js';
import { InteractableKind, type Zone } from '../world/types.js';

function fail(reason: string, detail: string): Failure {
  return failure('validation', reason, { detail });
}

// These guards take `unknown` rather than the declared field type on purpose.
// Content arrives from JSON through a widening cast, so a field can be absent
// or the wrong type however precisely the interface describes it. Checking the
// value rather than trusting the annotation is what keeps a malformed file a
// reported failure instead of a crash inside validation.
function isPositiveInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function isNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface SkillTable {
  readonly skills: readonly SkillDefinition[];
  get(id: SkillId): SkillDefinition | undefined;
}

export interface ItemCatalog {
  readonly items: readonly ItemDefinition[];
  get(id: ItemDefinitionId): ItemDefinition | undefined;
}

export interface NodeCatalog {
  readonly nodes: readonly NodeDefinition[];
  get(id: NodeId): NodeDefinition | undefined;
  /** The node worked at an interactable, or undefined if it is not a node. */
  byInteractable(id: InteractableId): NodeDefinition | undefined;
}

export interface RecipeBook {
  readonly recipes: readonly RecipeDefinition[];
  get(id: RecipeId): RecipeDefinition | undefined;
  /** Every recipe craftable at a station, in authored order. */
  atStation(id: InteractableId): readonly RecipeDefinition[];
}

export function buildSkillTable(
  definitions: readonly SkillDefinition[],
  maxSkillLevel: number,
): Result<SkillTable, Failure> {
  if (definitions.length === 0) {
    return err(fail('content.skills_empty', 'no skills are defined'));
  }

  const byId = new Map<string, SkillDefinition>();
  const problems: string[] = [];

  for (const skill of definitions) {
    if (byId.has(skill.id)) {
      return err(fail('content.skills_duplicate_id', `duplicate skill id "${skill.id}"`));
    }
    byId.set(skill.id, skill);

    const categories: string[] = Object.values(SkillCategory);
    if (!categories.includes(skill.category)) {
      problems.push(`skill "${skill.id}" has unknown category "${skill.category}"`);
    }
    if (!isNonEmptyString(skill.name)) {
      problems.push(`skill "${skill.id}" has no name`);
    }

    let previous = 0;
    for (const unlock of skill.unlocks) {
      if (!isPositiveInteger(unlock.atLevel) || unlock.atLevel > maxSkillLevel) {
        problems.push(
          `skill "${skill.id}" unlocks at level ${unlock.atLevel}, outside 1..${maxSkillLevel}`,
        );
      }
      // Ordered authoring is not cosmetic: an unlock list read top-down is how
      // a player is shown what comes next, and an out-of-order entry silently
      // misreports progress.
      if (unlock.atLevel < previous) {
        problems.push(
          `skill "${skill.id}" lists unlock at level ${unlock.atLevel} after level ${previous}`,
        );
      }
      previous = unlock.atLevel;
    }
  }

  if (problems.length > 0) {
    return err(fail('content.skills_invalid', problems.join('; ')));
  }

  return ok({
    skills: definitions,
    get: (id) => byId.get(id),
  });
}

export function buildItemCatalog(
  definitions: readonly ItemDefinition[],
  skills: SkillTable,
): Result<ItemCatalog, Failure> {
  if (definitions.length === 0) {
    return err(fail('content.items_empty', 'no items are defined'));
  }

  const byId = new Map<string, ItemDefinition>();
  const problems: string[] = [];
  const categories: string[] = Object.values(ItemCategory);
  const rarities: string[] = Object.values(ItemRarity);

  for (const item of definitions) {
    if (byId.has(item.id)) {
      return err(fail('content.items_duplicate_id', `duplicate item id "${item.id}"`));
    }
    byId.set(item.id, item);

    if (!categories.includes(item.category)) {
      problems.push(`item "${item.id}" has unknown category "${item.category}"`);
    }
    if (!rarities.includes(item.rarity)) {
      problems.push(`item "${item.id}" has unknown rarity "${item.rarity}"`);
    }
    if (!isNonEmptyString(item.name)) {
      problems.push(`item "${item.id}" has no name`);
    }
    if (!isPositiveInteger(item.stackCap)) {
      problems.push(`item "${item.id}" has a non-positive stack cap`);
    }
    if (!isNonNegativeInteger(item.baseValue)) {
      problems.push(`item "${item.id}" has a negative or fractional base value`);
    }

    // Tools carry per-copy wear, so they cannot share a slot with a copy that
    // has worn differently. A stacking tool would have to discard that state.
    if (item.category === ItemCategory.Tool) {
      if (item.tool === undefined) {
        problems.push(`item "${item.id}" is a tool but declares no tool properties`);
      } else {
        if (item.stackCap !== 1) {
          problems.push(`tool "${item.id}" must have a stack cap of 1`);
        }
        if (!isPositiveInteger(item.tool.maxDurability)) {
          problems.push(`tool "${item.id}" has a non-positive max durability`);
        }
        if (skills.get(item.tool.boundSkillId) === undefined) {
          problems.push(`tool "${item.id}" binds to unknown skill "${item.tool.boundSkillId}"`);
        }
      }
    } else if (item.tool !== undefined) {
      problems.push(`item "${item.id}" is not a tool but declares tool properties`);
    }
  }

  if (problems.length > 0) {
    return err(fail('content.items_invalid', problems.join('; ')));
  }

  return ok({
    items: definitions,
    get: (id) => byId.get(id),
  });
}

export function buildNodeCatalog(
  definitions: readonly NodeDefinition[],
  context: { readonly items: ItemCatalog; readonly skills: SkillTable; readonly zone: Zone },
): Result<NodeCatalog, Failure> {
  if (definitions.length === 0) {
    return err(fail('content.nodes_empty', 'no gathering nodes are defined'));
  }

  const byId = new Map<string, NodeDefinition>();
  const byInteractable = new Map<string, NodeDefinition>();
  const problems: string[] = [];
  const kinds: string[] = Object.values(GatheringNodeKind);
  const interactables = new Map(context.zone.interactables.map((entry) => [entry.id, entry]));

  for (const node of definitions) {
    if (byId.has(node.id)) {
      return err(fail('content.nodes_duplicate_id', `duplicate node id "${node.id}"`));
    }
    byId.set(node.id, node);

    if (byInteractable.has(node.interactableId)) {
      problems.push(`interactable "${node.interactableId}" is claimed by two nodes`);
    }
    byInteractable.set(node.interactableId, node);

    if (!kinds.includes(node.kind)) {
      problems.push(`node "${node.id}" has unknown kind "${node.kind}"`);
    }

    // The world owns placement. A node naming an interactable that was renamed
    // or is not actually harvestable would otherwise be unreachable in game
    // while looking perfectly valid on paper.
    const interactable = interactables.get(node.interactableId);
    if (interactable === undefined) {
      problems.push(`node "${node.id}" names unknown interactable "${node.interactableId}"`);
    } else if (interactable.kind !== InteractableKind.GatheringNode) {
      problems.push(
        `node "${node.id}" is bound to "${node.interactableId}", which is a ${interactable.kind}`,
      );
    }

    const skill = context.skills.get(node.requiredSkillId);
    if (skill === undefined) {
      problems.push(`node "${node.id}" requires unknown skill "${node.requiredSkillId}"`);
    } else if (skill.category !== SkillCategory.Gathering) {
      problems.push(`node "${node.id}" requires "${skill.id}", which is not a gathering skill`);
    }

    if (!isPositiveInteger(node.harvestIntervalMs)) {
      problems.push(`node "${node.id}" has a non-positive harvest interval`);
    }
    if (!isPositiveInteger(node.depletionHarvests)) {
      problems.push(`node "${node.id}" has a non-positive depletion count`);
    }
    if (node.dropTable.length === 0) {
      problems.push(`node "${node.id}" has an empty drop table`);
    }

    let totalWeight = 0;
    for (const entry of node.dropTable) {
      // Integer weights are a determinism requirement, not tidiness: a seeded
      // harvest must replay to an identical yield, and float sums vary with
      // ordering across platforms.
      if (!isPositiveInteger(entry.weight)) {
        problems.push(
          `node "${node.id}" drop "${entry.itemId}" has a non-positive or fractional weight`,
        );
      } else {
        totalWeight += entry.weight;
      }
      if (context.items.get(entry.itemId) === undefined) {
        problems.push(`node "${node.id}" drops unknown item "${entry.itemId}"`);
      }
      if (!isPositiveInteger(entry.minQuantity) || !isPositiveInteger(entry.maxQuantity)) {
        problems.push(`node "${node.id}" drop "${entry.itemId}" has a non-positive quantity`);
      } else if (entry.minQuantity > entry.maxQuantity) {
        problems.push(`node "${node.id}" drop "${entry.itemId}" has min above max`);
      }
    }
    if (node.dropTable.length > 0 && totalWeight === 0) {
      problems.push(`node "${node.id}" has a drop table whose weights sum to zero`);
    }
  }

  if (problems.length > 0) {
    return err(fail('content.nodes_invalid', problems.join('; ')));
  }

  return ok({
    nodes: definitions,
    get: (id) => byId.get(id),
    byInteractable: (id) => byInteractable.get(id),
  });
}

export function buildRecipeBook(
  definitions: readonly RecipeDefinition[],
  context: { readonly items: ItemCatalog; readonly skills: SkillTable; readonly zone: Zone },
): Result<RecipeBook, Failure> {
  if (definitions.length === 0) {
    return err(fail('content.recipes_empty', 'no recipes are defined'));
  }

  const byId = new Map<string, RecipeDefinition>();
  const byStation = new Map<string, RecipeDefinition[]>();
  const problems: string[] = [];
  const interactables = new Map(context.zone.interactables.map((entry) => [entry.id, entry]));

  for (const recipe of definitions) {
    if (byId.has(recipe.id)) {
      return err(fail('content.recipes_duplicate_id', `duplicate recipe id "${recipe.id}"`));
    }
    byId.set(recipe.id, recipe);

    const station = interactables.get(recipe.stationInteractableId);
    if (station === undefined) {
      problems.push(
        `recipe "${recipe.id}" names unknown station "${recipe.stationInteractableId}"`,
      );
    } else if (station.kind !== InteractableKind.CraftingStation) {
      problems.push(
        `recipe "${recipe.id}" is bound to "${recipe.stationInteractableId}", which is a ${station.kind}`,
      );
    } else {
      const existing = byStation.get(recipe.stationInteractableId);
      if (existing === undefined) byStation.set(recipe.stationInteractableId, [recipe]);
      else existing.push(recipe);
    }

    const skill = context.skills.get(recipe.requiredSkillId);
    if (skill === undefined) {
      problems.push(`recipe "${recipe.id}" requires unknown skill "${recipe.requiredSkillId}"`);
    } else if (skill.category !== SkillCategory.Crafting) {
      problems.push(`recipe "${recipe.id}" requires "${skill.id}", which is not a crafting skill`);
    }

    if (recipe.inputs.length === 0) {
      problems.push(`recipe "${recipe.id}" consumes nothing`);
    }
    const seenInputs = new Set<string>();
    for (const input of recipe.inputs) {
      if (context.items.get(input.itemId) === undefined) {
        problems.push(`recipe "${recipe.id}" consumes unknown item "${input.itemId}"`);
      }
      if (!isPositiveInteger(input.quantity)) {
        problems.push(
          `recipe "${recipe.id}" consumes a non-positive quantity of "${input.itemId}"`,
        );
      }
      // Two entries for one item would make the true cost the sum of scattered
      // lines, which is easy to misread and easy to double-charge.
      if (seenInputs.has(input.itemId)) {
        problems.push(`recipe "${recipe.id}" lists "${input.itemId}" as an input twice`);
      }
      seenInputs.add(input.itemId);
    }

    if (context.items.get(recipe.output.itemId) === undefined) {
      problems.push(`recipe "${recipe.id}" produces unknown item "${recipe.output.itemId}"`);
    }
    if (!isPositiveInteger(recipe.output.quantity)) {
      problems.push(`recipe "${recipe.id}" produces a non-positive quantity`);
    }
    // A recipe consuming its own output is a loop that either prints materials
    // or destroys them, depending on the waste roll. Neither is intended.
    if (seenInputs.has(recipe.output.itemId)) {
      problems.push(`recipe "${recipe.id}" consumes the item it produces`);
    }
    if (!isPositiveInteger(recipe.craftDurationMs)) {
      problems.push(`recipe "${recipe.id}" has a non-positive craft duration`);
    }
    if (recipe.baseWasteRateBasisPoints < 0 || recipe.baseWasteRateBasisPoints > 10_000) {
      problems.push(`recipe "${recipe.id}" has a waste rate outside 0..10000 basis points`);
    }
  }

  if (problems.length > 0) {
    return err(fail('content.recipes_invalid', problems.join('; ')));
  }

  return ok({
    recipes: definitions,
    get: (id) => byId.get(id),
    atStation: (id) => byStation.get(id) ?? [],
  });
}
