import { describe, it, expect } from 'vitest';
import {
  applyDamage,
  applyBuff,
  applyBlock,
  tickPoison,
  tickBurn,
  resetBlock,
  resolveCardEffects,
  type CombatantState,
} from '@engine/card-effects';
import type { DeckState } from '@engine/deck';
import type { CardDefinition } from '@shared/cards/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCombatant(overrides: Partial<CombatantState> = {}): CombatantState {
  return {
    hp: 50,
    maxHp: 50,
    block: 0,
    buffs: {},
    ...overrides,
  };
}

function makeDeck(overrides: Partial<DeckState> = {}): DeckState {
  return {
    drawPile: ['c', 'd', 'e'],
    hand: ['a', 'b'],
    discardPile: [],
    ...overrides,
  };
}

function makeCard(effects: CardDefinition['effects']): CardDefinition {
  return {
    id: 'test_card',
    name: 'Test Card',
    class: 'warrior',
    type: 'attack',
    cost: 1,
    effects,
    description: '',
    upgraded: false,
    tier: 'basic',
  };
}

// ---------------------------------------------------------------------------
// applyDamage
// ---------------------------------------------------------------------------

describe('applyDamage', () => {
  it('reduces defender HP by damage value', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30 });
    const { defender: result } = applyDamage(10, attacker, defender);
    expect(result.hp).toBe(20);
  });

  it('damage is absorbed by block first; remainder hits HP', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30, block: 6 });
    const { defender: result } = applyDamage(10, attacker, defender);
    expect(result.block).toBe(0);
    expect(result.hp).toBe(26); // 30 - (10 - 6)
  });

  it('block fully absorbs damage when block >= damage', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30, block: 15 });
    const { defender: result } = applyDamage(10, attacker, defender);
    expect(result.block).toBe(5);
    expect(result.hp).toBe(30); // unchanged
  });

  it('vulnerable increases damage taken by 50%', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ buffs: { vulnerable: 2 } });
    const { defender: result } = applyDamage(10, attacker, defender);
    // 10 * 1.5 = 15
    expect(result.hp).toBe(35);
  });

  it('weak reduces damage dealt by 25%', () => {
    const attacker = makeCombatant({ buffs: { weak: 2 } });
    const defender = makeCombatant();
    const { defender: result } = applyDamage(10, attacker, defender);
    // 10 * 0.75 = 7 (floored)
    expect(result.hp).toBe(43);
  });

  it('strength adds flat bonus to damage', () => {
    const attacker = makeCombatant({ buffs: { strength: 3 } });
    const defender = makeCombatant();
    const { defender: result } = applyDamage(10, attacker, defender);
    // (10 + 3) = 13
    expect(result.hp).toBe(37);
  });

  it('weak and vulnerable stack correctly', () => {
    const attacker = makeCombatant({ buffs: { weak: 1 } });
    const defender = makeCombatant({ buffs: { vulnerable: 1 } });
    const { defender: result } = applyDamage(10, attacker, defender);
    // floor(10 * 0.75) * 1.5 = floor(7.5) * 1.5 = 7 * 1.5 = floor(10.5) = 10
    expect(result.hp).toBe(40);
  });

  it('damage cannot reduce HP below 0', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 5 });
    const { defender: result } = applyDamage(100, attacker, defender);
    expect(result.hp).toBe(0);
  });

  it('does not mutate input state', () => {
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30, block: 5 });
    applyDamage(10, attacker, defender);
    expect(defender.hp).toBe(30);
    expect(defender.block).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// applyBlock
// ---------------------------------------------------------------------------

describe('applyBlock', () => {
  it('adds block value to target', () => {
    const target = makeCombatant({ block: 3 });
    const result = applyBlock(5, target);
    expect(result.block).toBe(8);
  });

  it('does not mutate input state', () => {
    const target = makeCombatant({ block: 3 });
    applyBlock(5, target);
    expect(target.block).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// applyBuff
// ---------------------------------------------------------------------------

describe('applyBuff', () => {
  it('adds a new buff to a target with no existing buff', () => {
    const target = makeCombatant();
    const result = applyBuff(target, 'strength', 2);
    expect(result.buffs['strength']).toBe(2);
  });

  it('stacks buff value on an existing buff', () => {
    const target = makeCombatant({ buffs: { strength: 1 } });
    const result = applyBuff(target, 'strength', 2);
    expect(result.buffs['strength']).toBe(3);
  });

  it('does not mutate input state', () => {
    const target = makeCombatant({ buffs: { strength: 1 } });
    applyBuff(target, 'strength', 2);
    expect(target.buffs['strength']).toBe(1);
  });

  it('stacks different buffs independently', () => {
    const target = makeCombatant({ buffs: { vulnerable: 1 } });
    const result = applyBuff(target, 'weak', 1);
    expect(result.buffs['vulnerable']).toBe(1);
    expect(result.buffs['weak']).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// tickPoison
// ---------------------------------------------------------------------------

describe('tickPoison', () => {
  it('deals poison stacks as damage bypassing block', () => {
    const target = makeCombatant({ hp: 30, block: 10, buffs: { poison: 5 } });
    const result = tickPoison(target);
    // Poison bypasses block
    expect(result.hp).toBe(25);
    expect(result.block).toBe(10); // block untouched
  });

  it('reduces poison stacks by 1 each tick', () => {
    const target = makeCombatant({ buffs: { poison: 5 } });
    const result = tickPoison(target);
    expect(result.buffs['poison']).toBe(4);
  });

  it('removes poison buff at 0 stacks', () => {
    const target = makeCombatant({ buffs: { poison: 1 } });
    const result = tickPoison(target);
    expect(result.buffs['poison']).toBeUndefined();
  });

  it('returns target unchanged when no poison', () => {
    const target = makeCombatant({ hp: 30 });
    const result = tickPoison(target);
    expect(result.hp).toBe(30);
    expect(result.buffs['poison']).toBeUndefined();
  });

  it('does not reduce HP below 0', () => {
    const target = makeCombatant({ hp: 2, buffs: { poison: 5 } });
    const result = tickPoison(target);
    expect(result.hp).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// tickBurn
// ---------------------------------------------------------------------------

describe('tickBurn', () => {
  it('deals burn stacks as damage bypassing block', () => {
    const target = makeCombatant({ hp: 30, block: 5, buffs: { burn: 4 } });
    const result = tickBurn(target);
    expect(result.hp).toBe(26);
    expect(result.block).toBe(5);
  });

  it('reduces burn stacks by 1 each tick', () => {
    const target = makeCombatant({ buffs: { burn: 3 } });
    const result = tickBurn(target);
    expect(result.buffs['burn']).toBe(2);
  });

  it('removes burn buff at 0 stacks', () => {
    const target = makeCombatant({ buffs: { burn: 1 } });
    const result = tickBurn(target);
    expect(result.buffs['burn']).toBeUndefined();
  });

  it('returns target unchanged when no burn', () => {
    const target = makeCombatant({ hp: 30 });
    const result = tickBurn(target);
    expect(result.hp).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// resetBlock
// ---------------------------------------------------------------------------

describe('resetBlock', () => {
  it('sets block to 0', () => {
    const target = makeCombatant({ block: 12 });
    const result = resetBlock(target);
    expect(result.block).toBe(0);
  });

  it('does not mutate input state', () => {
    const target = makeCombatant({ block: 12 });
    resetBlock(target);
    expect(target.block).toBe(12);
  });

  it('preserves other fields', () => {
    const target = makeCombatant({ hp: 40, block: 5, buffs: { strength: 2 } });
    const result = resetBlock(target);
    expect(result.hp).toBe(40);
    expect(result.buffs['strength']).toBe(2);
  });

  it('barricade buff preserves block across turn reset', () => {
    const target = makeCombatant({ block: 10, buffs: { barricade: 1 } });
    const result = resetBlock(target);
    expect(result.block).toBe(10); // block kept
  });
});

// ---------------------------------------------------------------------------
// resolveCardEffects
// ---------------------------------------------------------------------------

describe('resolveCardEffects', () => {
  it('damage effect reduces defender HP', () => {
    const card = makeCard([{ type: 'damage', value: 10, target: 'enemy' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30 });
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.hp).toBe(20);
  });

  it('block effect adds block to self', () => {
    const card = makeCard([{ type: 'block', value: 8, target: 'self' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.attacker.block).toBe(8);
  });

  it('buff effect adds buff to self', () => {
    const card = makeCard([{ type: 'buff', value: 2, target: 'self', buff: 'strength' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.attacker.buffs['strength']).toBe(2);
  });

  it('buff stacks when attacker already has that buff', () => {
    const card = makeCard([{ type: 'buff', value: 1, target: 'self', buff: 'strength' }]);
    const attacker = makeCombatant({ buffs: { strength: 2 } });
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.attacker.buffs['strength']).toBe(3);
  });

  it('debuff effect adds debuff to target', () => {
    const card = makeCard([{ type: 'debuff', value: 2, target: 'enemy', buff: 'vulnerable' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.buffs['vulnerable']).toBe(2);
  });

  it('debuff stacks when target already has that debuff', () => {
    const card = makeCard([{ type: 'debuff', value: 1, target: 'enemy', buff: 'weak' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant({ buffs: { weak: 2 } });
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.buffs['weak']).toBe(3);
  });

  it('draw effect draws cards into hand', () => {
    const card = makeCard([{ type: 'draw', value: 2 }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck({ drawPile: ['c', 'd', 'e'], hand: ['a'] });
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.deck.hand.length).toBe(3); // 1 + 2 drawn
  });

  it('poison effect adds poison stacks to target', () => {
    const card = makeCard([{ type: 'poison', value: 3, target: 'enemy' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.buffs['poison']).toBe(3);
  });

  it('burn effect adds burn stacks to target', () => {
    const card = makeCard([{ type: 'burn', value: 2, target: 'enemy' }]);
    const attacker = makeCombatant();
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.buffs['burn']).toBe(2);
  });

  it('heal effect restores HP up to maxHp', () => {
    const card = makeCard([{ type: 'heal', value: 10, target: 'self' }]);
    const attacker = makeCombatant({ hp: 30, maxHp: 50 });
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.attacker.hp).toBe(40);
  });

  it('heal does not exceed maxHp', () => {
    const card = makeCard([{ type: 'heal', value: 50, target: 'self' }]);
    const attacker = makeCombatant({ hp: 45, maxHp: 50 });
    const defender = makeCombatant();
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.attacker.hp).toBe(50);
  });

  it('card with multiple effects applies all in order', () => {
    const card = makeCard([
      { type: 'damage', value: 8, target: 'enemy' },
      { type: 'block', value: 5, target: 'self' },
    ]);
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 30 });
    const deck = makeDeck();
    const result = resolveCardEffects(card, attacker, defender, deck);
    expect(result.defender.hp).toBe(22);
    expect(result.attacker.block).toBe(5);
  });

  it('does not mutate input attacker or defender', () => {
    const card = makeCard([
      { type: 'damage', value: 10, target: 'enemy' },
      { type: 'block', value: 5, target: 'self' },
    ]);
    const attacker = makeCombatant();
    const defender = makeCombatant({ hp: 40 });
    const deck = makeDeck();
    resolveCardEffects(card, attacker, defender, deck);
    expect(attacker.block).toBe(0);
    expect(defender.hp).toBe(40);
  });
});
