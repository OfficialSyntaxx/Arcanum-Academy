/**
 * The shipped content, validated and compiled once at module load.
 *
 * Loading eagerly and throwing on bad content is deliberate. Content is not
 * user input: it is authored in this repository and validated by a test that
 * runs in CI, so a failure here means something broken was committed. Surfacing
 * that as a `Result` at every call site would spread handling for a condition
 * that must never reach production across the whole codebase; failing at import
 * makes it impossible to miss, in tests, on the server and in the client bundle
 * alike.
 *
 * The JSON files are the authoring format. They live inside `src` rather than a
 * top-level `content/` directory because the package compiles with
 * `rootDir: "src"` - a sibling directory would sit outside the build graph and
 * need a copy step to reach the runtime. Keeping them here means the compiler
 * checks their shape against these types, so a mistyped number is caught at
 * build time and the validators below are left to check meaning: that ids are
 * unique, references resolve, and weights make a usable distribution.
 */

import { expect } from '../result.js';
import { DEFAULT_TUNABLES } from '../config/tunables.js';
import { COURTYARD } from '../world/courtyard.js';
import type { ItemDefinition } from '../items/types.js';
import type { NodeDefinition } from '../gathering/types.js';
import type { RecipeDefinition } from '../crafting/types.js';
import type { SkillDefinition } from '../skills/types.js';
import type { CardDefinition, SchoolDefinition } from '../cards/types.js';
import {
  buildCardCatalog,
  buildItemCatalog,
  buildNodeCatalog,
  buildRecipeBook,
  buildSchoolTable,
  buildSkillTable,
  type CardCatalog,
  type ItemCatalog,
  type NodeCatalog,
  type RecipeBook,
  type SchoolTable,
  type SkillTable,
} from './catalogs.js';
import { buildStringTable, type StringTable } from './strings.js';
import itemsDocument from './data/items.json';
import nodesDocument from './data/nodes.json';
import recipesDocument from './data/recipes.json';
import skillsDocument from './data/skills.json';
import schoolsDocument from './data/schools.json';
import cardsDocument from './data/cards.json';
import stringsDocument from './data/strings.en.json';

export * from './catalogs.js';
export * from './strings.js';

/**
 * Version of the authoring format, not of the content itself.
 *
 * It is asserted rather than branched on: there is exactly one format so far.
 * The moment a second exists, `createMigrationRunner` in `../persistence` is
 * the forward-only chain to route these documents through.
 */
export const CONTENT_SCHEMA_VERSION = 1;

const documents = [
  ['skills', skillsDocument.schemaVersion],
  ['items', itemsDocument.schemaVersion],
  ['nodes', nodesDocument.schemaVersion],
  ['recipes', recipesDocument.schemaVersion],
  ['schools', schoolsDocument.schemaVersion],
  ['cards', cardsDocument.schemaVersion],
  ['strings', stringsDocument.schemaVersion],
] as const;

for (const [name, version] of documents) {
  if (version !== CONTENT_SCHEMA_VERSION) {
    throw new Error(
      `Content file "${name}" declares schema version ${version}, expected ${CONTENT_SCHEMA_VERSION}`,
    );
  }
}

// One cast per document, at the boundary and nowhere else.
//
// It has to widen through `unknown`: JSON gives plain strings, and a branded id
// carries a phantom property no literal can satisfy, so the two never overlap
// no matter how correct the file is. That is precisely the claim the builders
// below exist to check - every id, enum member, quantity and cross-reference is
// verified at runtime before any of this becomes a catalog, and the test over
// the shipped files is what turns a mistake here into a failed build rather
// than a broken harvest.
const skillDefinitions = skillsDocument.entries as unknown as readonly SkillDefinition[];
const itemDefinitions = itemsDocument.entries as unknown as readonly ItemDefinition[];
const nodeDefinitions = nodesDocument.entries as unknown as readonly NodeDefinition[];
const recipeDefinitions = recipesDocument.entries as unknown as readonly RecipeDefinition[];
const schoolDefinitions = schoolsDocument.entries as unknown as readonly SchoolDefinition[];
const cardDefinitions = cardsDocument.entries as unknown as readonly CardDefinition[];

// Dependency order: items bind tools to skills, and nodes and recipes reference
// both. Building in any other order would validate against a half-built world.
export const SKILL_TABLE: SkillTable = expect(
  buildSkillTable(skillDefinitions, DEFAULT_TUNABLES.progression.maxSkillLevel),
  'shipped skill content is invalid',
);

export const ITEM_CATALOG: ItemCatalog = expect(
  buildItemCatalog(itemDefinitions, SKILL_TABLE),
  'shipped item content is invalid',
);

export const NODE_CATALOG: NodeCatalog = expect(
  buildNodeCatalog(nodeDefinitions, {
    items: ITEM_CATALOG,
    skills: SKILL_TABLE,
    zones: [COURTYARD],
  }),
  'shipped gathering content is invalid',
);

export const RECIPE_BOOK: RecipeBook = expect(
  buildRecipeBook(recipeDefinitions, {
    items: ITEM_CATALOG,
    skills: SKILL_TABLE,
    zones: [COURTYARD],
  }),
  'shipped recipe content is invalid',
);

export const SCHOOL_TABLE: SchoolTable = expect(
  buildSchoolTable(schoolDefinitions),
  'shipped school content is invalid',
);

export const CARD_CATALOG: CardCatalog = expect(
  buildCardCatalog(cardDefinitions, { items: ITEM_CATALOG, schools: SCHOOL_TABLE }),
  'shipped card content is invalid',
);

export const STRINGS: StringTable = expect(
  buildStringTable(stringsDocument.locale, stringsDocument.strings),
  'shipped string content is invalid',
);
