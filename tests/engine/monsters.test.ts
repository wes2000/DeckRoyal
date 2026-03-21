import { describe, it, expect } from 'vitest';
import {
  MONSTERS,
  createMonsterState,
  getMonsterIntent,
  advanceMonsterPattern,
  getRandomMonster,
} from '@engine/monsters';
import { MONSTER_HP_RANGES } from '@shared/constants';

describe('monster definitions', () => {
  it('has at least 3 small monsters', () => {
    const small = MONSTERS.filter((m) => m.tier === 'small');
    expect(small.length).toBeGreaterThanOrEqual(3);
  });

  it('has at least 2 rare monsters', () => {
    const rare = MONSTERS.filter((m) => m.tier === 'rare');
    expect(rare.length).toBeGreaterThanOrEqual(2);
  });

  it('small monster HP ranges are within global small range (30-45)', () => {
    const small = MONSTERS.filter((m) => m.tier === 'small');
    for (const m of small) {
      expect(m.hp.min).toBeGreaterThanOrEqual(MONSTER_HP_RANGES.small.min);
      expect(m.hp.max).toBeLessThanOrEqual(MONSTER_HP_RANGES.small.max);
    }
  });

  it('rare monster HP ranges are within global rare range (60-80)', () => {
    const rare = MONSTERS.filter((m) => m.tier === 'rare');
    for (const m of rare) {
      expect(m.hp.min).toBeGreaterThanOrEqual(MONSTER_HP_RANGES.rare.min);
      expect(m.hp.max).toBeLessThanOrEqual(MONSTER_HP_RANGES.rare.max);
    }
  });

  it('every monster has at least one action in its pattern', () => {
    for (const m of MONSTERS) {
      expect(m.pattern.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('monster actions are of valid types', () => {
    const validTypes = new Set(['attack', 'defend', 'buff']);
    for (const m of MONSTERS) {
      for (const action of m.pattern) {
        expect(validTypes.has(action.type)).toBe(true);
      }
    }
  });

  it('buff actions include a buff property', () => {
    for (const m of MONSTERS) {
      for (const action of m.pattern) {
        if (action.type === 'buff') {
          expect(action.buff).toBeDefined();
        }
      }
    }
  });
});

describe('createMonsterState', () => {
  it('small monster has HP in 30-45 range', () => {
    const def = MONSTERS.find((m) => m.tier === 'small')!;
    const state = createMonsterState(def);
    expect(state.hp).toBeGreaterThanOrEqual(MONSTER_HP_RANGES.small.min);
    expect(state.hp).toBeLessThanOrEqual(MONSTER_HP_RANGES.small.max);
  });

  it('rare monster has HP in 60-80 range', () => {
    const def = MONSTERS.find((m) => m.tier === 'rare')!;
    const state = createMonsterState(def);
    expect(state.hp).toBeGreaterThanOrEqual(MONSTER_HP_RANGES.rare.min);
    expect(state.hp).toBeLessThanOrEqual(MONSTER_HP_RANGES.rare.max);
  });

  it('creates state with correct id and name from definition', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    expect(state.id).toBe(def.id);
    expect(state.name).toBe(def.name);
  });

  it('initializes block to 0', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    expect(state.block).toBe(0);
  });

  it('initializes patternIndex to 0', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    expect(state.patternIndex).toBe(0);
  });

  it('initializes buffs to empty record', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    expect(state.buffs).toEqual({});
  });

  it('hp is randomized within definition min/max range', () => {
    const def = MONSTERS.find((m) => m.tier === 'small')!;
    const hpValues = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const state = createMonsterState(def);
      hpValues.add(state.hp);
      expect(state.hp).toBeGreaterThanOrEqual(def.hp.min);
      expect(state.hp).toBeLessThanOrEqual(def.hp.max);
    }
    // With enough samples, expect more than one unique value (range > 1)
    if (def.hp.max > def.hp.min) {
      expect(hpValues.size).toBeGreaterThan(1);
    }
  });

  it('maxHp equals hp on creation', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    expect(state.maxHp).toBe(state.hp);
  });
});

describe('getMonsterIntent', () => {
  it('returns the action at the current patternIndex', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    // patternIndex is 0 after creation
    const intent = getMonsterIntent(state, def);
    expect(intent).toEqual(def.pattern[0]);
  });

  it('returns the correct action for non-zero patternIndex', () => {
    const def = MONSTERS.find((m) => m.pattern.length >= 2)!;
    const state = { ...createMonsterState(def), patternIndex: 1 };
    const intent = getMonsterIntent(state, def);
    expect(intent).toEqual(def.pattern[1]);
  });

  it('returns an action with a valid type', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    const intent = getMonsterIntent(state, def);
    expect(['attack', 'defend', 'buff']).toContain(intent.type);
  });

  it('does not mutate the monster state', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    const originalIndex = state.patternIndex;
    getMonsterIntent(state, def);
    expect(state.patternIndex).toBe(originalIndex);
  });

  it('throws RangeError when patternIndex is out of bounds', () => {
    const def = MONSTERS[0];
    const state = { ...createMonsterState(def), patternIndex: def.pattern.length };
    expect(() => getMonsterIntent(state, def)).toThrow(RangeError);
    expect(() => getMonsterIntent(state, def)).toThrow(
      `patternIndex ${def.pattern.length} is out of bounds for monster "${def.id}"`,
    );
  });

  it('throws RangeError when patternIndex is negative', () => {
    const def = MONSTERS[0];
    const state = { ...createMonsterState(def), patternIndex: -1 };
    expect(() => getMonsterIntent(state, def)).toThrow(RangeError);
  });
});

describe('advanceMonsterPattern', () => {
  it('increments patternIndex by 1', () => {
    const def = MONSTERS.find((m) => m.pattern.length >= 2)!;
    const state = createMonsterState(def);
    const next = advanceMonsterPattern(state, def);
    expect(next.patternIndex).toBe(1);
  });

  it('cycles back to 0 after reaching the end of the pattern', () => {
    const def = MONSTERS[0];
    const lastIndex = def.pattern.length - 1;
    const state = { ...createMonsterState(def), patternIndex: lastIndex };
    const next = advanceMonsterPattern(state, def);
    expect(next.patternIndex).toBe(0);
  });

  it('pattern cycles back to start after completing all actions', () => {
    const def = MONSTERS[0];
    let state = createMonsterState(def);
    // Walk through entire pattern
    for (let i = 0; i < def.pattern.length; i++) {
      state = advanceMonsterPattern(state, def);
    }
    expect(state.patternIndex).toBe(0);
  });

  it('does not mutate the input state', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    const originalIndex = state.patternIndex;
    advanceMonsterPattern(state, def);
    expect(state.patternIndex).toBe(originalIndex);
  });

  it('returns a new state object (pure function)', () => {
    const def = MONSTERS[0];
    const state = createMonsterState(def);
    const next = advanceMonsterPattern(state, def);
    expect(next).not.toBe(state);
  });
});

describe('getRandomMonster', () => {
  it('returns a small monster when tier is "small"', () => {
    const def = getRandomMonster('small');
    expect(def.tier).toBe('small');
  });

  it('returns a rare monster when tier is "rare"', () => {
    const def = getRandomMonster('rare');
    expect(def.tier).toBe('rare');
  });

  it('returns a monster with a valid id', () => {
    const def = getRandomMonster('small');
    expect(typeof def.id).toBe('string');
    expect(def.id.length).toBeGreaterThan(0);
  });

  it('returned monster exists in MONSTERS array', () => {
    const def = getRandomMonster('rare');
    expect(MONSTERS).toContainEqual(def);
  });

  it('returns different monsters across multiple calls (randomness)', () => {
    const smallMonsters = MONSTERS.filter((m) => m.tier === 'small');
    if (smallMonsters.length > 1) {
      const ids = new Set<string>();
      for (let i = 0; i < 50; i++) {
        ids.add(getRandomMonster('small').id);
      }
      expect(ids.size).toBeGreaterThan(1);
    }
  });
});
