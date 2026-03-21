import { describe, it, expect } from 'vitest';
import type {
  EffectType,
  BuffType,
  CardEffect,
  CardDefinition,
} from '@shared/cards/types';

describe('EffectType', () => {
  it('covers all 10 effect types', () => {
    const effectTypes: EffectType[] = [
      'damage',
      'block',
      'buff',
      'debuff',
      'draw',
      'heal',
      'energy',
      'poison',
      'burn',
      'aoe_damage',
    ];
    expect(effectTypes).toHaveLength(10);
  });
});

describe('BuffType', () => {
  it('covers all 8 buff types', () => {
    const buffTypes: BuffType[] = [
      'strength',
      'vulnerable',
      'weak',
      'thorns',
      'rage',
      'combo',
      'frozen',
      'barricade',
    ];
    expect(buffTypes).toHaveLength(8);
  });
});

describe('CardEffect', () => {
  it('creates a simple damage effect', () => {
    const effect: CardEffect = {
      type: 'damage',
      value: 6,
      target: 'enemy',
    };
    expect(effect.type).toBe('damage');
    expect(effect.value).toBe(6);
    expect(effect.target).toBe('enemy');
    expect(effect.buff).toBeUndefined();
    expect(effect.condition).toBeUndefined();
  });

  it('creates a block effect targeting self', () => {
    const effect: CardEffect = {
      type: 'block',
      value: 5,
      target: 'self',
    };
    expect(effect.type).toBe('block');
    expect(effect.target).toBe('self');
  });

  it('creates a buff effect with a buff type', () => {
    const effect: CardEffect = {
      type: 'buff',
      value: 2,
      target: 'self',
      buff: 'strength',
    };
    expect(effect.buff).toBe('strength');
  });

  it('creates a damage effect with a condition', () => {
    const effect: CardEffect = {
      type: 'damage',
      value: 3,
      target: 'enemy',
      condition: 'per_combo',
    };
    expect(effect.condition).toBe('per_combo');
  });

  it('creates an aoe_damage effect', () => {
    const effect: CardEffect = { type: 'aoe_damage', value: 4 };
    expect(effect.type).toBe('aoe_damage');
  });

  it('creates a poison debuff effect', () => {
    const effect: CardEffect = {
      type: 'debuff',
      value: 3,
      target: 'enemy',
      buff: 'vulnerable',
      condition: 'per_poison',
    };
    expect(effect.buff).toBe('vulnerable');
    expect(effect.condition).toBe('per_poison');
  });

  it('creates a draw effect', () => {
    const effect: CardEffect = { type: 'draw', value: 2 };
    expect(effect.type).toBe('draw');
    expect(effect.value).toBe(2);
  });

  it('creates a heal effect', () => {
    const effect: CardEffect = { type: 'heal', value: 10, target: 'self' };
    expect(effect.type).toBe('heal');
  });

  it('creates an energy effect', () => {
    const effect: CardEffect = { type: 'energy', value: 1, target: 'self' };
    expect(effect.type).toBe('energy');
  });

  it('creates a burn effect targeting enemy', () => {
    const effect: CardEffect = { type: 'burn', value: 5, target: 'enemy' };
    expect(effect.type).toBe('burn');
    expect(effect.target).toBe('enemy');
  });
});

describe('CardDefinition', () => {
  it('creates a basic warrior attack card', () => {
    const card: CardDefinition = {
      id: 'warrior_strike',
      name: 'Strike',
      class: 'warrior',
      type: 'attack',
      cost: 1,
      effects: [{ type: 'damage', value: 6, target: 'enemy' }],
      description: 'Deal 6 damage.',
      upgraded: false,
      tier: 'basic',
    };

    expect(card.id).toBe('warrior_strike');
    expect(card.class).toBe('warrior');
    expect(card.type).toBe('attack');
    expect(card.cost).toBe(1);
    expect(card.effects).toHaveLength(1);
    expect(card.effects[0].value).toBe(6);
    expect(card.upgraded).toBe(false);
    expect(card.tier).toBe('basic');
    expect(card.upgradeId).toBeUndefined();
    expect(card.archetype).toBeUndefined();
  });

  it('creates an upgraded mage power card with archetype', () => {
    const card: CardDefinition = {
      id: 'mage_fireball_plus',
      name: 'Fireball+',
      class: 'mage',
      type: 'power',
      cost: 2,
      effects: [
        { type: 'aoe_damage', value: 8 },
        { type: 'debuff', value: 2, target: 'enemy', buff: 'vulnerable' },
      ],
      description: 'Deal 8 damage to all enemies. Apply 2 Vulnerable.',
      upgraded: true,
      upgradeId: 'mage_fireball',
      archetype: 'burn',
      tier: 'powerful',
    };

    expect(card.upgraded).toBe(true);
    expect(card.upgradeId).toBe('mage_fireball');
    expect(card.archetype).toBe('burn');
    expect(card.tier).toBe('powerful');
    expect(card.effects).toHaveLength(2);
  });

  it('creates a common rogue skill card with combo condition', () => {
    const card: CardDefinition = {
      id: 'rogue_backstab',
      name: 'Backstab',
      class: 'rogue',
      type: 'skill',
      cost: 1,
      effects: [
        { type: 'damage', value: 4, target: 'enemy', condition: 'per_combo' },
        { type: 'buff', value: 1, target: 'self', buff: 'combo' },
      ],
      description: 'Deal 4 damage per Combo. Gain 1 Combo.',
      upgraded: false,
      archetype: 'combo',
      tier: 'common',
    };

    expect(card.class).toBe('rogue');
    expect(card.type).toBe('skill');
    expect(card.effects[0].condition).toBe('per_combo');
    expect(card.effects[1].buff).toBe('combo');
  });

  it('creates a warrior skill card with barricade buff', () => {
    const card: CardDefinition = {
      id: 'warrior_fortify',
      name: 'Fortify',
      class: 'warrior',
      type: 'skill',
      cost: 1,
      effects: [
        { type: 'block', value: 8, target: 'self' },
        { type: 'buff', value: 1, target: 'self', buff: 'barricade' },
      ],
      description: 'Gain 8 Block. Gain 1 Barricade.',
      upgraded: false,
      tier: 'common',
    };

    expect(card.effects[1].buff).toBe('barricade');
  });

  it('creates a card with per_missing_hp condition', () => {
    const card: CardDefinition = {
      id: 'warrior_berserk',
      name: 'Berserk',
      class: 'warrior',
      type: 'attack',
      cost: 1,
      effects: [{ type: 'damage', value: 2, target: 'enemy', condition: 'per_missing_hp' }],
      description: 'Deal 2 damage for each missing HP.',
      upgraded: false,
      tier: 'powerful',
    };

    expect(card.effects[0].condition).toBe('per_missing_hp');
  });
});
