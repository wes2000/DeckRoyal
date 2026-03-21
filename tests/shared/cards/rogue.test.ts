import { describe, it, expect } from 'vitest';
import { ROGUE_CARDS } from '@shared/cards/rogue';

const nonUpgraded = ROGUE_CARDS.filter((c) => !c.upgraded);
const upgraded = ROGUE_CARDS.filter((c) => c.upgraded);
const basicCards = nonUpgraded.filter((c) => !c.archetype);

describe('ROGUE_CARDS – collection shape', () => {
  it('has exactly 9 unique basic (non-upgraded, no archetype) cards', () => {
    expect(basicCards).toHaveLength(9);
  });

  it('has a matching upgraded version for every non-upgraded card', () => {
    expect(upgraded).toHaveLength(nonUpgraded.length);
  });

  it('all cards have class rogue', () => {
    for (const card of ROGUE_CARDS) {
      expect(card.class).toBe('rogue');
    }
  });

  it('all card costs are between 0 and 3 inclusive', () => {
    for (const card of ROGUE_CARDS) {
      expect(card.cost).toBeGreaterThanOrEqual(0);
      expect(card.cost).toBeLessThanOrEqual(3);
    }
  });

  it('all non-upgraded cards have an upgradeId pointing to an existing upgraded card', () => {
    const upgradedIds = new Set(upgraded.map((c) => c.id));
    for (const card of nonUpgraded) {
      expect(card.upgradeId).toBeDefined();
      expect(upgradedIds.has(card.upgradeId as string)).toBe(true);
    }
  });

  it('all card ids are unique', () => {
    const ids = ROGUE_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('ROGUE_CARDS – archetypes', () => {
  it('has exactly 8 non-upgraded Assassin archetype cards', () => {
    const assassin = nonUpgraded.filter((c) => c.archetype === 'assassin');
    expect(assassin).toHaveLength(8);
  });

  it('has exactly 8 non-upgraded Poisoner archetype cards', () => {
    const poisoner = nonUpgraded.filter((c) => c.archetype === 'poisoner');
    expect(poisoner).toHaveLength(8);
  });

  it('has exactly 8 non-upgraded Shadow archetype cards', () => {
    const shadow = nonUpgraded.filter((c) => c.archetype === 'shadow');
    expect(shadow).toHaveLength(8);
  });
});

describe('ROGUE_CARDS – basic cards spot-checks', () => {
  const find = (id: string) => ROGUE_CARDS.find((c) => c.id === id);

  it('Stab deals 6 damage at cost 1', () => {
    const card = find('r_stab');
    expect(card).toBeDefined();
    expect(card!.cost).toBe(1);
    expect(card!.type).toBe('attack');
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(6);
  });

  it('Stab+ deals 9 damage', () => {
    const card = find('r_stab_plus');
    expect(card).toBeDefined();
    expect(card!.upgraded).toBe(true);
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(9);
  });

  it('Dodge gains 5 block at cost 1', () => {
    const card = find('r_dodge');
    expect(card).toBeDefined();
    expect(card!.type).toBe('skill');
    const block = card!.effects.find((e) => e.type === 'block');
    expect(block?.value).toBe(5);
  });

  it('Dodge+ gains 8 block', () => {
    const card = find('r_dodge_plus');
    const block = card!.effects.find((e) => e.type === 'block');
    expect(block?.value).toBe(8);
  });

  it('Quick Slash costs 0 and deals 4 damage', () => {
    const card = find('r_quick_slash');
    expect(card!.cost).toBe(0);
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(4);
  });

  it('Quick Slash+ deals 7 damage', () => {
    const card = find('r_quick_slash_plus');
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(7);
  });

  it('Backstab costs 2 and deals 11 damage', () => {
    const card = find('r_backstab');
    expect(card!.cost).toBe(2);
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(11);
  });

  it('Backstab+ deals 16 damage', () => {
    const card = find('r_backstab_plus');
    const dmg = card!.effects.find((e) => e.type === 'damage');
    expect(dmg?.value).toBe(16);
  });

  it('Smoke Bomb gives 6 block and draws 1 card', () => {
    const card = find('r_smoke_bomb');
    const block = card!.effects.find((e) => e.type === 'block');
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(block?.value).toBe(6);
    expect(draw?.value).toBe(1);
  });

  it('Smoke Bomb+ gives 9 block and draws 1', () => {
    const card = find('r_smoke_bomb_plus');
    const block = card!.effects.find((e) => e.type === 'block');
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(block?.value).toBe(9);
    expect(draw?.value).toBe(1);
  });

  it('Preparation costs 0 and draws 2', () => {
    const card = find('r_preparation');
    expect(card!.cost).toBe(0);
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(draw?.value).toBe(2);
  });

  it('Preparation+ draws 3', () => {
    const card = find('r_preparation_plus');
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(draw?.value).toBe(3);
  });

  it('Fan of Knives does aoe 5 damage and 2 poison', () => {
    const card = find('r_fan_of_knives');
    const aoe = card!.effects.find((e) => e.type === 'aoe_damage');
    const poison = card!.effects.find((e) => e.type === 'poison');
    expect(aoe?.value).toBe(5);
    expect(poison?.value).toBe(2);
  });

  it('Fan of Knives+ does aoe 7 damage and 3 poison', () => {
    const card = find('r_fan_of_knives_plus');
    const aoe = card!.effects.find((e) => e.type === 'aoe_damage');
    const poison = card!.effects.find((e) => e.type === 'poison');
    expect(aoe?.value).toBe(7);
    expect(poison?.value).toBe(3);
  });

  it('Evade costs 1 and gives 8 block', () => {
    const card = find('r_evade');
    expect(card!.cost).toBe(1);
    const block = card!.effects.find((e) => e.type === 'block');
    expect(block?.value).toBe(8);
  });

  it('Evade+ gives 12 block', () => {
    const card = find('r_evade_plus');
    const block = card!.effects.find((e) => e.type === 'block');
    expect(block?.value).toBe(12);
  });

  it('Shadow Step costs 1 and gains 1 energy + draws 1', () => {
    const card = find('r_shadow_step');
    expect(card!.cost).toBe(1);
    const energy = card!.effects.find((e) => e.type === 'energy');
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(energy?.value).toBe(1);
    expect(draw?.value).toBe(1);
  });

  it('Shadow Step+ gains 1 energy + draws 2', () => {
    const card = find('r_shadow_step_plus');
    const energy = card!.effects.find((e) => e.type === 'energy');
    const draw = card!.effects.find((e) => e.type === 'draw');
    expect(energy?.value).toBe(1);
    expect(draw?.value).toBe(2);
  });
});

describe('ROGUE_CARDS – assassin archetype cards', () => {
  const assassinCards = [
    'r_flurry',
    'r_death_mark',
    'r_execute',
    'r_combo_strike',
    'r_finishing_blow',
    'r_ambush',
    'r_coup_de_grace',
    'r_chain_kill',
  ];

  it('all 8 assassin cards exist as non-upgraded', () => {
    for (const id of assassinCards) {
      const card = ROGUE_CARDS.find((c) => c.id === id);
      expect(card).toBeDefined();
      expect(card!.upgraded).toBe(false);
      expect(card!.archetype).toBe('assassin');
    }
  });

  it('all 8 assassin cards have an upgraded counterpart', () => {
    for (const id of assassinCards) {
      const base = ROGUE_CARDS.find((c) => c.id === id)!;
      const up = ROGUE_CARDS.find((c) => c.id === base.upgradeId);
      expect(up).toBeDefined();
      expect(up!.upgraded).toBe(true);
    }
  });
});

describe('ROGUE_CARDS – poisoner archetype cards', () => {
  const poisonerCards = [
    'r_envenom',
    'r_toxic_blade',
    'r_deadly_brew',
    'r_noxious_gas',
    'r_venom_slash',
    'r_plague',
    'r_corrode',
    'r_virulent_wound',
  ];

  it('all 8 poisoner cards exist as non-upgraded', () => {
    for (const id of poisonerCards) {
      const card = ROGUE_CARDS.find((c) => c.id === id);
      expect(card).toBeDefined();
      expect(card!.upgraded).toBe(false);
      expect(card!.archetype).toBe('poisoner');
    }
  });

  it('all 8 poisoner cards have an upgraded counterpart', () => {
    for (const id of poisonerCards) {
      const base = ROGUE_CARDS.find((c) => c.id === id)!;
      const up = ROGUE_CARDS.find((c) => c.id === base.upgradeId);
      expect(up).toBeDefined();
      expect(up!.upgraded).toBe(true);
    }
  });

  it('all poisoner cards apply poison', () => {
    for (const id of poisonerCards) {
      const card = ROGUE_CARDS.find((c) => c.id === id)!;
      const hasPoison = card.effects.some((e) => e.type === 'poison');
      expect(hasPoison).toBe(true);
    }
  });
});

describe('ROGUE_CARDS – shadow archetype cards', () => {
  const shadowCards = [
    'r_vanish',
    'r_cloak_of_shadows',
    'r_shadowstep',
    'r_evasion',
    'r_blade_dance',
    'r_sleight_of_hand',
    'r_tumble',
    'r_phantom_strike',
  ];

  it('all 8 shadow cards exist as non-upgraded', () => {
    for (const id of shadowCards) {
      const card = ROGUE_CARDS.find((c) => c.id === id);
      expect(card).toBeDefined();
      expect(card!.upgraded).toBe(false);
      expect(card!.archetype).toBe('shadow');
    }
  });

  it('all 8 shadow cards have an upgraded counterpart', () => {
    for (const id of shadowCards) {
      const base = ROGUE_CARDS.find((c) => c.id === id)!;
      const up = ROGUE_CARDS.find((c) => c.id === base.upgradeId);
      expect(up).toBeDefined();
      expect(up!.upgraded).toBe(true);
    }
  });
});
