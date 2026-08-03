import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNABLES,
  Rng,
  appraisalVariance,
  appraisalWindow,
  assertLegalDeck,
  gradeForScore,
  gradeOdds,
  gradeRewardMultiplierBasisPoints,
  inspectDeck,
  isLegal,
  isSlabbed,
  remainingCopies,
  rollGrade,
  asId,
  type CardDefinition,
  type CardDefinitionId,
} from '../index.js';

const grading = DEFAULT_TUNABLES.grading;
const progression = DEFAULT_TUNABLES.progression;
const combat = DEFAULT_TUNABLES.combat;

function card(id: string): CardDefinition {
  return {
    id: asId<CardDefinitionId>(id),
    nameKey: `card.${id}.name`,
    textKey: `card.${id}.text`,
    schoolId: 'school.resonance',
    type: 'CANTRIP',
    rarity: 'COMMON',
    cost: 2,
    effects: [{ kind: 'DAMAGE', target: 'OPPONENT', magnitude: 3 }],
    scribeInputs: [{ itemId: 'item.ink.azure', quantity: 1 }],
    scribeSkillLevel: 1,
    artKey: 'art',
  };
}

const KNOWN = new Map<string, CardDefinition>();
for (const id of ['card.a', 'card.b', 'card.c', 'card.d', 'card.e', 'card.f', 'card.g']) {
  KNOWN.set(id, card(id));
}
const lookup = (id: CardDefinitionId) => KNOWN.get(id);

/** A legal deck: seven spells, three copies each bar one, twenty in total. */
function legalDeck(): CardDefinitionId[] {
  const ids: CardDefinitionId[] = [];
  for (const id of [...KNOWN.keys()]) {
    const copies = ids.length + 3 <= combat.deckSize ? 3 : combat.deckSize - ids.length;
    for (let n = 0; n < copies; n += 1) ids.push(asId<CardDefinitionId>(id));
  }
  return ids;
}

describe('grade bands', () => {
  it('spans every grade across the score range', () => {
    expect(gradeForScore(0, grading)).toBe(grading.minGrade);
    expect(gradeForScore(100, grading)).toBe(grading.maxGrade);
    expect(gradeForScore(95, grading)).toBe(grading.maxGrade);
  });

  it('never leaves the declared bounds, however wild the score', () => {
    for (const score of [-500, -1, 0, 50, 100, 101, 5_000]) {
      const grade = gradeForScore(score, grading);
      expect(grade).toBeGreaterThanOrEqual(grading.minGrade);
      expect(grade).toBeLessThanOrEqual(grading.maxGrade);
    }
  });

  it('rises monotonically with score', () => {
    let previous = gradeForScore(0, grading);
    for (let score = 1; score <= 100; score += 1) {
      const grade = gradeForScore(score, grading);
      expect(grade).toBeGreaterThanOrEqual(previous);
      previous = grade;
    }
  });
});

describe('appraisal window', () => {
  it('narrows as skill rises, then holds at the floor', () => {
    expect(appraisalVariance(1, grading)).toBe(grading.baseVariance);
    expect(appraisalVariance(30, grading)).toBeLessThan(appraisalVariance(10, grading));
    // Past the floor, further skill buys a higher centre rather than more
    // certainty - which is what keeps a grade 10 an event.
    expect(appraisalVariance(progression.maxSkillLevel, grading)).toBe(grading.minVariance);
  });

  it('never collapses to nothing, so a master is never guaranteed a ten', () => {
    expect(appraisalVariance(progression.maxSkillLevel, grading)).toBeGreaterThanOrEqual(1);
    const odds = gradeOdds(progression.maxSkillLevel, grading, progression);
    expect(odds[grading.maxGrade - grading.minGrade]).toBeLessThan(1);
  });

  it('rises with skill', () => {
    const novice = appraisalWindow(1, grading, progression);
    const master = appraisalWindow(progression.maxSkillLevel, grading, progression);
    expect(master.lowest).toBeGreaterThan(novice.highest);
  });
});

describe('published odds', () => {
  it('is a probability distribution at every level', () => {
    for (let level = 1; level <= progression.maxSkillLevel; level += 1) {
      const odds = gradeOdds(level, grading, progression);
      const total = odds.reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 10);
      for (const value of odds) expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  /**
   * The exit criterion: a million rolls must land within half a percentage
   * point of the published table. This is the test that would catch the odds
   * and the roll drifting apart, which is the failure that matters.
   */
  it('matches a million simulated rolls within 0.5%', () => {
    for (const level of [1, 25, 60, progression.maxSkillLevel]) {
      const odds = gradeOdds(level, grading, progression);
      const bands = grading.maxGrade - grading.minGrade + 1;
      const observed = new Array<number>(bands).fill(0);
      const rng = Rng.fromSeed(`odds:${level}`);
      const rolls = 1_000_000;

      for (let n = 0; n < rolls; n += 1) {
        const { grade } = rollGrade(rng, level, grading, progression);
        const band = grade - grading.minGrade;
        observed[band] = (observed[band] ?? 0) + 1;
      }

      for (let band = 0; band < bands; band += 1) {
        const expected = odds[band] ?? 0;
        const actual = (observed[band] ?? 0) / rolls;
        expect(Math.abs(actual - expected)).toBeLessThan(0.005);
      }
    }
  });

  it('keeps a grade 10 uncommon even for a master, so a serial still means something', () => {
    const odds = gradeOdds(progression.maxSkillLevel, grading, progression);
    const topGrade = odds[grading.maxGrade - grading.minGrade] ?? 0;
    expect(topGrade).toBeGreaterThan(0);
    expect(topGrade).toBeLessThan(0.25);
  });

  it('makes a master far more likely to slab than a novice', () => {
    const slabbedShare = (level: number) =>
      gradeOdds(level, grading, progression).reduce(
        (sum, value, band) => (isSlabbed(band + grading.minGrade, grading) ? sum + value : sum),
        0,
      );
    expect(slabbedShare(1)).toBe(0);
    const master = slabbedShare(progression.maxSkillLevel);
    expect(master).toBeGreaterThan(0.3);
    // Not a certainty either: slabbing everything would make the slab the
    // default state rather than a distinction.
    expect(master).toBeLessThan(0.75);
  });
});

describe('grade rewards', () => {
  it('is the floor at the lowest grade and the ceiling at the highest', () => {
    expect(gradeRewardMultiplierBasisPoints(grading.minGrade, grading)).toBe(
      grading.rewardMultiplierMinBasisPoints,
    );
    expect(gradeRewardMultiplierBasisPoints(grading.maxGrade, grading)).toBe(
      grading.rewardMultiplierMaxBasisPoints,
    );
  });

  it('rises without a cliff a player could farm around', () => {
    let previous = gradeRewardMultiplierBasisPoints(grading.minGrade, grading);
    for (let grade = grading.minGrade + 1; grade <= grading.maxGrade; grade += 1) {
      const value = gradeRewardMultiplierBasisPoints(grade, grading);
      expect(value).toBeGreaterThan(previous);
      // No single grade may be worth more than a fifth of the whole spread.
      const spread =
        grading.rewardMultiplierMaxBasisPoints - grading.rewardMultiplierMinBasisPoints;
      expect(value - previous).toBeLessThanOrEqual(spread / 5);
      previous = value;
    }
  });
});

describe('deck legality', () => {
  it('accepts a deck of exactly the required size within the copy limit', () => {
    const deck = legalDeck();
    expect(deck).toHaveLength(combat.deckSize);
    expect(isLegal(inspectDeck(deck, lookup, combat))).toBe(true);
    expect(assertLegalDeck(deck, lookup, combat).ok).toBe(true);
  });

  it('refuses a deck under the required size', () => {
    const deck = legalDeck().slice(0, combat.deckSize - 1);
    const result = assertLegalDeck(deck, lookup, combat);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('exactly');
  });

  it('refuses a deck over the required size, so thinning is not a strategy', () => {
    const deck = [...legalDeck(), asId<CardDefinitionId>('card.a')];
    expect(isLegal(inspectDeck(deck, lookup, combat))).toBe(false);
  });

  it('refuses more copies of one spell than the limit permits', () => {
    const deck = new Array<CardDefinitionId>(combat.deckSize).fill(
      asId<CardDefinitionId>('card.a'),
    );
    const result = assertLegalDeck(deck, lookup, combat);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('at most');
  });

  it('refuses a card nobody defined', () => {
    const deck = legalDeck();
    deck[0] = asId<CardDefinitionId>('card.imaginary');
    const result = assertLegalDeck(deck, lookup, combat);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.detail).toContain('is not a card');
  });

  it('reports every problem at once rather than one per attempt', () => {
    const deck = [
      ...new Array<CardDefinitionId>(5).fill(asId<CardDefinitionId>('card.a')),
      asId<CardDefinitionId>('card.imaginary'),
    ];
    const legality = inspectDeck(deck, lookup, combat);
    expect(legality.cardCount).not.toBe(legality.requiredCount);
    expect(legality.overCopies).toHaveLength(1);
    expect(legality.unknown).toHaveLength(1);
  });

  it('counts copies by definition, so one slab is never three cards', () => {
    const deck = [asId<CardDefinitionId>('card.a'), asId<CardDefinitionId>('card.a')];
    expect(remainingCopies(deck, asId<CardDefinitionId>('card.a'), combat)).toBe(
      combat.maxCopiesPerSpell - 2,
    );
    expect(remainingCopies(deck, asId<CardDefinitionId>('card.b'), combat)).toBe(
      combat.maxCopiesPerSpell,
    );
  });

  it('never reports negative headroom', () => {
    const deck = new Array<CardDefinitionId>(10).fill(asId<CardDefinitionId>('card.a'));
    expect(remainingCopies(deck, asId<CardDefinitionId>('card.a'), combat)).toBe(0);
  });
});
