import { describe, it, expect } from 'vitest';
import { MAGE_CARDS } from '@shared/cards/mage';

const nonUpgraded = MAGE_CARDS.filter((c) => !c.upgraded);
const upgraded = MAGE_CARDS.filter((c) => c.upgraded);
const upgradeIds = new Set(upgraded.map((c) => c.id));

describe('MAGE_CARDS - basic structure', () => {
  it('has exactly 16 unique basic cards (non-upgraded)', () => {
    const basicNonUpgraded = nonUpgraded.filter((c) => c.tier === 'basic');
    expect(basicNonUpgraded).toHaveLength(16);
    const ids = basicNonUpgraded.map((c) => c.id);
    expect(new Set(ids).size).toBe(16);
  });

  it('has 8 Elementalist archetype cards (non-upgraded)', () => {
    const elementalistCards = nonUpgraded.filter((c) => c.archetype === 'elementalist');
    expect(elementalistCards).toHaveLength(8);
  });

  it('has 8 Arcanist archetype cards (non-upgraded)', () => {
    const arcanistCards = nonUpgraded.filter((c) => c.archetype === 'arcanist');
    expect(arcanistCards).toHaveLength(8);
  });

  it('has 8 Frost Mage archetype cards (non-upgraded)', () => {
    const frostMageCards = nonUpgraded.filter((c) => c.archetype === 'frost_mage');
    expect(frostMageCards).toHaveLength(8);
  });

  it('all cards have class mage', () => {
    for (const card of MAGE_CARDS) {
      expect(card.class).toBe('mage');
    }
  });

  it('all non-upgraded cards have an upgradeId pointing to an existing upgraded card', () => {
    for (const card of nonUpgraded) {
      expect(card.upgradeId).toBeDefined();
      expect(upgradeIds.has(card.upgradeId!)).toBe(true);
    }
  });

  it('card costs are 0-3', () => {
    for (const card of MAGE_CARDS) {
      expect(card.cost).toBeGreaterThanOrEqual(0);
      expect(card.cost).toBeLessThanOrEqual(3);
    }
  });
});

describe('MAGE_CARDS - basic card spot checks', () => {
  it('Spark deals 6 damage', () => {
    const spark = MAGE_CARDS.find((c) => c.id === 'm_spark');
    expect(spark).toBeDefined();
    expect(spark!.cost).toBe(1);
    expect(spark!.type).toBe('attack');
    expect(spark!.effects[0]).toMatchObject({ type: 'damage', value: 6 });
  });

  it('Spark+ deals 9 damage', () => {
    const sparkPlus = MAGE_CARDS.find((c) => c.id === 'm_spark_plus');
    expect(sparkPlus).toBeDefined();
    expect(sparkPlus!.upgraded).toBe(true);
    expect(sparkPlus!.effects[0]).toMatchObject({ type: 'damage', value: 9 });
  });

  it('Ward gives 5 block', () => {
    const ward = MAGE_CARDS.find((c) => c.id === 'm_ward');
    expect(ward).toBeDefined();
    expect(ward!.cost).toBe(1);
    expect(ward!.type).toBe('skill');
    expect(ward!.effects[0]).toMatchObject({ type: 'block', value: 5 });
  });

  it('Ward+ gives 8 block', () => {
    const wardPlus = MAGE_CARDS.find((c) => c.id === 'm_ward_plus');
    expect(wardPlus!.effects[0]).toMatchObject({ type: 'block', value: 8 });
  });

  it('Arcane Missile hits twice for 4 damage each', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_arcane_missile');
    expect(card).toBeDefined();
    expect(card!.cost).toBe(1);
    const dmgEffects = card!.effects.filter((e) => e.type === 'damage');
    expect(dmgEffects).toHaveLength(2);
    expect(dmgEffects[0].value).toBe(4);
    expect(dmgEffects[1].value).toBe(4);
  });

  it('Arcane Missile+ hits twice for 6 damage each', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_arcane_missile_plus');
    expect(card).toBeDefined();
    const dmgEffects = card!.effects.filter((e) => e.type === 'damage');
    expect(dmgEffects).toHaveLength(2);
    expect(dmgEffects[0].value).toBe(6);
    expect(dmgEffects[1].value).toBe(6);
  });

  it('Frost Bolt deals 7 damage and applies 1 frozen', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_frost_bolt');
    expect(card).toBeDefined();
    expect(card!.cost).toBe(1);
    const dmgEffect = card!.effects.find((e) => e.type === 'damage');
    const debuffEffect = card!.effects.find((e) => e.type === 'debuff');
    expect(dmgEffect!.value).toBe(7);
    expect(debuffEffect).toBeDefined();
    expect(debuffEffect!.buff).toBe('frozen');
    expect(debuffEffect!.value).toBe(1);
  });

  it('Frost Bolt+ deals 10 damage and applies 1 frozen', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_frost_bolt_plus');
    const dmgEffect = card!.effects.find((e) => e.type === 'damage');
    expect(dmgEffect!.value).toBe(10);
  });

  it('Mana Shield gives 8 block', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_mana_shield');
    expect(card!.effects[0]).toMatchObject({ type: 'block', value: 8 });
  });

  it('Mana Shield+ gives 12 block', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_mana_shield_plus');
    expect(card!.effects[0]).toMatchObject({ type: 'block', value: 12 });
  });

  it('Concentrate gains 1 energy', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_concentrate');
    expect(card!.cost).toBe(1);
    expect(card!.effects[0]).toMatchObject({ type: 'energy', value: 1 });
  });

  it('Concentrate+ gains 2 energy', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_concentrate_plus');
    expect(card!.effects[0]).toMatchObject({ type: 'energy', value: 2 });
  });

  it('Focus draws 2 cards', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_focus');
    expect(card!.effects[0]).toMatchObject({ type: 'draw', value: 2 });
  });

  it('Focus+ draws 3 cards', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_focus_plus');
    expect(card!.effects[0]).toMatchObject({ type: 'draw', value: 3 });
  });

  it('Meditation heals 4 HP', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_meditation');
    expect(card!.effects[0]).toMatchObject({ type: 'heal', value: 4 });
  });

  it('Meditation+ heals 7 HP', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_meditation_plus');
    expect(card!.effects[0]).toMatchObject({ type: 'heal', value: 7 });
  });

  it('Arcane Blast costs 2 and deals 14 damage', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_arcane_blast');
    expect(card!.cost).toBe(2);
    expect(card!.effects[0]).toMatchObject({ type: 'damage', value: 14 });
  });

  it('Arcane Blast+ deals 20 damage', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_arcane_blast_plus');
    expect(card!.effects[0]).toMatchObject({ type: 'damage', value: 20 });
  });
});

describe('MAGE_CARDS - archetype spot checks', () => {
  it('Elementalist cards include Fireball and have archetype elementalist', () => {
    const fireball = MAGE_CARDS.find((c) => c.id === 'm_fireball');
    expect(fireball).toBeDefined();
    expect(fireball!.archetype).toBe('elementalist');
  });

  it('Arcanist cards include Siphon Power and have archetype arcanist', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_siphon_power');
    expect(card).toBeDefined();
    expect(card!.archetype).toBe('arcanist');
  });

  it('Frost Mage cards include Deep Freeze and have archetype frost_mage', () => {
    const card = MAGE_CARDS.find((c) => c.id === 'm_deep_freeze');
    expect(card).toBeDefined();
    expect(card!.archetype).toBe('frost_mage');
  });
});
