import type { MonsterState, MonsterAction, MonsterDefinition } from '@shared/types';

export type { MonsterAction, MonsterDefinition };

export const MONSTERS: MonsterDefinition[] = [
  // --- Small monsters ---
  {
    id: 'goblin',
    name: 'Goblin',
    tier: 'small',
    hp: { min: 30, max: 35 },
    pattern: [
      { type: 'attack', value: 6 },
      { type: 'attack', value: 8 },
      { type: 'defend', value: 4 },
    ],
  },
  {
    id: 'slime',
    name: 'Slime',
    tier: 'small',
    hp: { min: 35, max: 40 },
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'buff', value: 2, buff: 'strength' },
      { type: 'attack', value: 7 },
    ],
  },
  {
    id: 'wolf',
    name: 'Wolf',
    tier: 'small',
    hp: { min: 32, max: 42 },
    pattern: [
      { type: 'attack', value: 9 },
      { type: 'attack', value: 7 },
      { type: 'defend', value: 3 },
      { type: 'attack', value: 11 },
    ],
  },
  {
    id: 'skeleton',
    name: 'Skeleton',
    tier: 'small',
    hp: { min: 38, max: 45 },
    pattern: [
      { type: 'defend', value: 5 },
      { type: 'attack', value: 8 },
      { type: 'buff', value: 1, buff: 'dexterity' },
      { type: 'attack', value: 6 },
    ],
  },
  // --- Rare monsters ---
  {
    id: 'dragon',
    name: 'Dragon',
    tier: 'rare',
    hp: { min: 65, max: 80 },
    pattern: [
      { type: 'attack', value: 12 },
      { type: 'buff', value: 3, buff: 'strength' },
      { type: 'attack', value: 8 },
      { type: 'attack', value: 15 },
    ],
  },
  {
    id: 'troll',
    name: 'Troll',
    tier: 'rare',
    hp: { min: 60, max: 75 },
    pattern: [
      { type: 'attack', value: 10 },
      { type: 'defend', value: 8 },
      { type: 'buff', value: 2, buff: 'regeneration' },
      { type: 'attack', value: 14 },
      { type: 'attack', value: 10 },
    ],
  },
  {
    id: 'golem',
    name: 'Stone Golem',
    tier: 'rare',
    hp: { min: 62, max: 78 },
    pattern: [
      { type: 'defend', value: 10 },
      { type: 'attack', value: 18 },
      { type: 'buff', value: 2, buff: 'strength' },
      { type: 'defend', value: 6 },
      { type: 'attack', value: 20 },
    ],
  },
];

/**
 * Creates a fresh MonsterState from a definition, randomizing HP within the
 * definition's min/max range. Pure function — no side effects beyond Math.random.
 */
export function createMonsterState(definition: MonsterDefinition): MonsterState {
  const hp =
    Math.floor(Math.random() * (definition.hp.max - definition.hp.min + 1)) +
    definition.hp.min;

  return {
    id: definition.id,
    name: definition.name,
    hp,
    maxHp: hp,
    block: 0,
    patternIndex: 0,
    buffs: {},
    intent: definition.pattern[0],
  };
}

/**
 * Returns the MonsterAction the monster intends to execute this turn,
 * based on its current patternIndex. Does not advance the index.
 */
export function getMonsterIntent(
  monster: MonsterState,
  definition: MonsterDefinition,
): MonsterAction {
  if (monster.patternIndex < 0 || monster.patternIndex >= definition.pattern.length) {
    throw new RangeError(
      `patternIndex ${monster.patternIndex} is out of bounds for monster "${definition.id}" ` +
        `with pattern length ${definition.pattern.length}`,
    );
  }
  return definition.pattern[monster.patternIndex];
}

/**
 * Returns a new MonsterState with patternIndex incremented by 1,
 * cycling back to 0 when the end of the pattern is reached.
 * Pure — does not mutate the input state.
 */
export function advanceMonsterPattern(
  monster: MonsterState,
  definition: MonsterDefinition,
): MonsterState {
  const nextIndex = (monster.patternIndex + 1) % definition.pattern.length;
  return { ...monster, patternIndex: nextIndex, intent: definition.pattern[nextIndex] };
}

/**
 * Returns a random MonsterDefinition of the requested tier.
 */
export function getRandomMonster(tier: 'small' | 'rare'): MonsterDefinition {
  const pool = MONSTERS.filter((m) => m.tier === tier);
  return pool[Math.floor(Math.random() * pool.length)];
}
