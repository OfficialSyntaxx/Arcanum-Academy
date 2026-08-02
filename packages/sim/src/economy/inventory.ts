/**
 * Inventory arithmetic.
 *
 * This lives in `sim` rather than the server because ADR-0001 requires the
 * client's prediction and the server's authority to be the same code. A client
 * that guessed at stack splitting with its own implementation would disagree
 * with the server in exactly the cases that matter - a nearly full bag, a
 * partial stack - and every disagreement is a resync the player sees.
 *
 * A slot holds one item definition. Materials stack up to the definition's cap
 * and spill into further slots; tools never stack, so each occupies its own.
 * Nothing here mutates: every operation returns a new inventory, which is what
 * lets a caller resolve a harvest tick by tick and abandon the result if the
 * whole command turns out to be invalid.
 */

import {
  err,
  failure,
  FailureCode,
  ok,
  type Failure,
  type ItemCatalog,
  type ItemDefinitionId,
  type ItemStack,
  type Result,
} from '@arcanum/shared';

export interface Inventory {
  readonly stacks: readonly ItemStack[];
  readonly slotCapacity: number;
}

export function createInventory(slotCapacity: number): Inventory {
  return { stacks: [], slotCapacity };
}

/** Total quantity of one item across every slot holding it. */
export function quantityOf(inventory: Inventory, itemId: ItemDefinitionId): number {
  let total = 0;
  for (const stack of inventory.stacks) {
    if (stack.definitionId === itemId) total += stack.quantity;
  }
  return total;
}

export function usedSlots(inventory: Inventory): number {
  return inventory.stacks.length;
}

/**
 * How many of an item would actually fit.
 *
 * Gathering asks this before minting anything. A harvest that would overflow
 * awards what fits rather than failing outright, because a session that stops
 * dead on a full bag is the unattended-progress interruption that tool
 * durability was deliberately designed to avoid; the same reasoning applies
 * here.
 */
export function spaceFor(
  inventory: Inventory,
  itemId: ItemDefinitionId,
  catalog: ItemCatalog,
): number {
  const definition = catalog.get(itemId);
  if (definition === undefined) return 0;

  let room = 0;
  for (const stack of inventory.stacks) {
    if (stack.definitionId === itemId) room += definition.stackCap - stack.quantity;
  }
  const freeSlots = inventory.slotCapacity - inventory.stacks.length;
  return room + freeSlots * definition.stackCap;
}

/**
 * Adds items, topping up partial stacks before consuming an empty slot.
 *
 * Filling existing stacks first is not merely tidy: it is what stops a bag from
 * fragmenting into many part-filled slots of the same material and reporting
 * itself full while holding very little.
 */
export function addItems(
  inventory: Inventory,
  itemId: ItemDefinitionId,
  quantity: number,
  catalog: ItemCatalog,
): Result<Inventory, Failure> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return err(
      failure(FailureCode.Validation, 'inventory.invalid_quantity', {
        context: { itemId, quantity },
      }),
    );
  }
  const definition = catalog.get(itemId);
  if (definition === undefined) {
    return err(failure(FailureCode.NotFound, 'inventory.unknown_item', { context: { itemId } }));
  }
  if (quantity > spaceFor(inventory, itemId, catalog)) {
    return err(
      failure(FailureCode.Conflict, 'inventory.slot_full', {
        detail: 'not enough room for the whole amount',
        context: { itemId, quantity, slotCapacity: inventory.slotCapacity },
      }),
    );
  }

  const stacks = inventory.stacks.map((stack) => ({ ...stack }));
  let remaining = quantity;

  for (const stack of stacks) {
    if (remaining === 0) break;
    if (stack.definitionId !== itemId) continue;
    const room = definition.stackCap - stack.quantity;
    if (room <= 0) continue;
    const moved = Math.min(room, remaining);
    stack.quantity += moved;
    remaining -= moved;
  }

  while (remaining > 0) {
    const moved = Math.min(definition.stackCap, remaining);
    stacks.push({ definitionId: itemId, quantity: moved });
    remaining -= moved;
  }

  return ok({ ...inventory, stacks });
}

/**
 * Removes items, draining the smallest stacks first.
 *
 * Draining small stacks first consolidates the bag over time instead of leaving
 * a trail of near-empty slots behind every withdrawal.
 */
export function removeItems(
  inventory: Inventory,
  itemId: ItemDefinitionId,
  quantity: number,
): Result<Inventory, Failure> {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return err(
      failure(FailureCode.Validation, 'inventory.invalid_quantity', {
        context: { itemId, quantity },
      }),
    );
  }
  const held = quantityOf(inventory, itemId);
  if (held < quantity) {
    return err(
      failure(FailureCode.Conflict, 'inventory.insufficient_items', {
        detail: 'the inventory does not hold that many',
        context: { itemId, held, requested: quantity },
      }),
    );
  }

  const ordered = inventory.stacks
    .map((stack, index) => ({ stack, index }))
    .filter((entry) => entry.stack.definitionId === itemId)
    // Index breaks ties so the result never depends on sort stability, which
    // would otherwise be a way for client and server to diverge.
    .sort((a, b) => a.stack.quantity - b.stack.quantity || a.index - b.index);

  const quantities = new Map<number, number>();
  let remaining = quantity;
  for (const entry of ordered) {
    if (remaining === 0) break;
    const taken = Math.min(entry.stack.quantity, remaining);
    quantities.set(entry.index, entry.stack.quantity - taken);
    remaining -= taken;
  }

  const stacks: ItemStack[] = [];
  inventory.stacks.forEach((stack, index) => {
    const replacement = quantities.get(index);
    if (replacement === undefined) {
      stacks.push(stack);
      return;
    }
    // A slot emptied to zero is released rather than kept as a husk.
    if (replacement > 0) stacks.push({ definitionId: stack.definitionId, quantity: replacement });
  });

  return ok({ ...inventory, stacks });
}

/** True when every ingredient is held in the quantity required. */
export function hasAll(
  inventory: Inventory,
  ingredients: readonly { readonly itemId: ItemDefinitionId; readonly quantity: number }[],
): boolean {
  return ingredients.every(
    (ingredient) => quantityOf(inventory, ingredient.itemId) >= ingredient.quantity,
  );
}
