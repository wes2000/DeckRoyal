import { describe, it, expect } from 'vitest';
import { WARRIOR_CARDS } from '@shared/cards/warrior';
import type { CardDefinition } from '@shared/cards/types';

describe('WARRIOR_CARDS', () => {
  const baseCards = WARRIOR_CARDS.filter(c => !c.upgraded);
  const upgradedCards = WARRIOR_CARDS.filter(c => c.upgraded);

  it('has exactly 80 entries (40 base + 40 upgraded)', () => {
    // 16 basic + 8 berserker + 8 ironclad + 8 warlord = 40 base
    // each base has an upgraded version = 40 upgraded
    expect(WARRIOR_CARDS).toHaveLength(80);
  });

  it('has exactly 16 unique basic cards (not counting upgrades)', () => {
    const basicCards = baseCards.filter(c => c.tier === 'basic');
    expect(basicCards).toHaveLength(16);
    const ids = basicCards.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(16);
  });

  it('has exactly 40 unique base cards total', () => {
    expect(baseCards).toHaveLength(40);
    const ids = baseCards.map(c => c.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(40);
  });

  it('has exactly 40 upgraded cards', () => {
    expect(upgradedCards).toHaveLength(40);
  });

  it('has 1 Strike definition and 1 Defend definition', () => {
    const strikes = WARRIOR_CARDS.filter(c => c.name === 'Strike');
    const defends = WARRIOR_CARDS.filter(c => c.name === 'Defend');
    expect(strikes).toHaveLength(2); // base + upgraded
    expect(defends).toHaveLength(2); // base + upgraded
    expect(strikes.filter(c => !c.upgraded)).toHaveLength(1);
    expect(defends.filter(c => !c.upgraded)).toHaveLength(1);
  });

  it('has 8 Berserker archetype base cards', () => {
    const berserker = baseCards.filter(c => c.archetype === 'berserker');
    expect(berserker).toHaveLength(8);
  });

  it('has 8 Ironclad archetype base cards', () => {
    const ironclad = baseCards.filter(c => c.archetype === 'ironclad');
    expect(ironclad).toHaveLength(8);
  });

  it('has 8 Warlord archetype base cards', () => {
    const warlord = baseCards.filter(c => c.archetype === 'warlord');
    expect(warlord).toHaveLength(8);
  });

  it('all cards have class warrior', () => {
    for (const card of WARRIOR_CARDS) {
      expect(card.class).toBe('warrior');
    }
  });

  it('all base cards have an upgradeId pointing to an existing upgraded card', () => {
    const upgradedIds = new Set(upgradedCards.map(c => c.id));
    for (const card of baseCards) {
      expect(card.upgradeId).toBeDefined();
      expect(upgradedIds.has(card.upgradeId!)).toBe(true);
    }
  });

  it('all upgraded versions exist in the array', () => {
    const allIds = new Set(WARRIOR_CARDS.map(c => c.id));
    for (const card of baseCards) {
      expect(allIds.has(card.upgradeId!)).toBe(true);
    }
  });

  it('card costs are between 0 and 3', () => {
    for (const card of WARRIOR_CARDS) {
      expect(card.cost).toBeGreaterThanOrEqual(0);
      expect(card.cost).toBeLessThanOrEqual(3);
    }
  });

  it('each card has at least one effect', () => {
    for (const card of WARRIOR_CARDS) {
      expect(card.effects.length).toBeGreaterThanOrEqual(1);
    }
  });

  describe('Strike', () => {
    it('base deals 6 damage at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_strike')!;
      expect(card).toBeDefined();
      expect(card.cost).toBe(1);
      expect(card.type).toBe('attack');
      expect(card.effects[0]).toMatchObject({ type: 'damage', value: 6 });
    });

    it('upgraded deals 9 damage', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_strike_plus')!;
      expect(card).toBeDefined();
      expect(card.upgraded).toBe(true);
      expect(card.effects[0]).toMatchObject({ type: 'damage', value: 9 });
    });
  });

  describe('Defend', () => {
    it('base gives 5 block at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_defend')!;
      expect(card.cost).toBe(1);
      expect(card.type).toBe('skill');
      expect(card.effects[0]).toMatchObject({ type: 'block', value: 5 });
    });

    it('upgraded gives 8 block', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_defend_plus')!;
      expect(card.effects[0]).toMatchObject({ type: 'block', value: 8 });
    });
  });

  describe('Bash', () => {
    it('base deals 8 damage + 2 Vulnerable at cost 2', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_bash')!;
      expect(card.cost).toBe(2);
      expect(card.type).toBe('attack');
      const damageEffect = card.effects.find(e => e.type === 'damage');
      const debuffEffect = card.effects.find(e => e.buff === 'vulnerable');
      expect(damageEffect?.value).toBe(8);
      expect(debuffEffect?.value).toBe(2);
    });

    it('upgraded deals 12 damage + 3 Vulnerable', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_bash_plus')!;
      const damageEffect = card.effects.find(e => e.type === 'damage');
      const debuffEffect = card.effects.find(e => e.buff === 'vulnerable');
      expect(damageEffect?.value).toBe(12);
      expect(debuffEffect?.value).toBe(3);
    });
  });

  describe('Heavy Blow', () => {
    it('base deals 12 damage at cost 2', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_heavy_blow')!;
      expect(card.cost).toBe(2);
      expect(card.effects[0]).toMatchObject({ type: 'damage', value: 12 });
    });

    it('upgraded deals 18 damage', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_heavy_blow_plus')!;
      expect(card.effects[0]).toMatchObject({ type: 'damage', value: 18 });
    });
  });

  describe('War Cry', () => {
    it('base draws 2 cards at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_war_cry')!;
      expect(card.cost).toBe(1);
      expect(card.type).toBe('skill');
      expect(card.effects[0]).toMatchObject({ type: 'draw', value: 2 });
    });

    it('upgraded draws 3 cards', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_war_cry_plus')!;
      expect(card.effects[0]).toMatchObject({ type: 'draw', value: 3 });
    });
  });

  describe('Shield Bash', () => {
    it('base deals 5 damage + 5 block at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_shield_bash')!;
      expect(card.cost).toBe(1);
      const damageEffect = card.effects.find(e => e.type === 'damage');
      const blockEffect = card.effects.find(e => e.type === 'block');
      expect(damageEffect?.value).toBe(5);
      expect(blockEffect?.value).toBe(5);
    });

    it('upgraded deals 8 damage + 8 block', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_shield_bash_plus')!;
      const damageEffect = card.effects.find(e => e.type === 'damage');
      const blockEffect = card.effects.find(e => e.type === 'block');
      expect(damageEffect?.value).toBe(8);
      expect(blockEffect?.value).toBe(8);
    });
  });

  describe('Cleave', () => {
    it('base deals 8 aoe_damage at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_cleave')!;
      expect(card.cost).toBe(1);
      expect(card.effects[0]).toMatchObject({ type: 'aoe_damage', value: 8 });
    });

    it('upgraded deals 12 aoe_damage', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_cleave_plus')!;
      expect(card.effects[0]).toMatchObject({ type: 'aoe_damage', value: 12 });
    });
  });

  describe('Intimidate', () => {
    it('base applies 1 Weak at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_intimidate')!;
      expect(card.cost).toBe(1);
      expect(card.type).toBe('skill');
      const debuff = card.effects.find(e => e.buff === 'weak');
      expect(debuff?.value).toBe(1);
    });

    it('upgraded applies 2 Weak', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_intimidate_plus')!;
      const debuff = card.effects.find(e => e.buff === 'weak');
      expect(debuff?.value).toBe(2);
    });
  });

  describe('Iron Will', () => {
    it('base grants 1 strength at cost 1', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_iron_will')!;
      expect(card.cost).toBe(1);
      expect(card.type).toBe('power');
      const buff = card.effects.find(e => e.buff === 'strength');
      expect(buff?.value).toBe(1);
    });

    it('upgraded grants 2 strength', () => {
      const card = WARRIOR_CARDS.find(c => c.id === 'w_iron_will_plus')!;
      const buff = card.effects.find(e => e.buff === 'strength');
      expect(buff?.value).toBe(2);
    });
  });

  describe('Berserker archetype cards', () => {
    const berserkerIds = [
      'w_reckless_swing',
      'w_blood_fury',
      'w_rage_stack',
      'w_seeing_red',
      'w_frenzy',
      'w_wound_exploit',
      'w_berserk',
      'w_rampage',
    ];

    it('all berserker cards exist by id', () => {
      const allIds = new Set(WARRIOR_CARDS.map(c => c.id));
      for (const id of berserkerIds) {
        expect(allIds.has(id)).toBe(true);
      }
    });

    it('all berserker cards have archetype berserker', () => {
      for (const id of berserkerIds) {
        const card = WARRIOR_CARDS.find(c => c.id === id)!;
        expect(card.archetype).toBe('berserker');
      }
    });
  });

  describe('Ironclad archetype cards', () => {
    const ironcladIds = [
      'w_fortress',
      'w_iron_skin',
      'w_barricade',
      'w_thorns',
      'w_counter_blow',
      'w_entrench',
      'w_shield_wall',
      'w_armor_up',
    ];

    it('all ironclad cards exist by id', () => {
      const allIds = new Set(WARRIOR_CARDS.map(c => c.id));
      for (const id of ironcladIds) {
        expect(allIds.has(id)).toBe(true);
      }
    });

    it('all ironclad cards have archetype ironclad', () => {
      for (const id of ironcladIds) {
        const card = WARRIOR_CARDS.find(c => c.id === id)!;
        expect(card.archetype).toBe('ironclad');
      }
    });
  });

  describe('Warlord archetype cards', () => {
    const warlordIds = [
      'w_battle_shout',
      'w_weaken',
      'w_disarm',
      'w_commanding_strike',
      'w_rally',
      'w_tactical_retreat',
      'w_overwhelm',
      'w_exploit_opening',
    ];

    it('all warlord cards exist by id', () => {
      const allIds = new Set(WARRIOR_CARDS.map(c => c.id));
      for (const id of warlordIds) {
        expect(allIds.has(id)).toBe(true);
      }
    });

    it('all warlord cards have archetype warlord', () => {
      for (const id of warlordIds) {
        const card = WARRIOR_CARDS.find(c => c.id === id)!;
        expect(card.archetype).toBe('warlord');
      }
    });
  });

  describe('ID format validation', () => {
    it('all base card ids start with w_ and do not end with _plus', () => {
      for (const card of baseCards) {
        expect(card.id.startsWith('w_')).toBe(true);
        expect(card.id.endsWith('_plus')).toBe(false);
      }
    });

    it('all upgraded card ids start with w_ and end with _plus', () => {
      for (const card of upgradedCards) {
        expect(card.id.startsWith('w_')).toBe(true);
        expect(card.id.endsWith('_plus')).toBe(true);
      }
    });
  });

  describe('Tier validation', () => {
    it('basic cards (Strike, Defend) have tier basic', () => {
      const basicCards = baseCards.filter(c =>
        c.name === 'Strike' || c.name === 'Defend'
      );
      for (const card of basicCards) {
        expect(card.tier).toBe('basic');
      }
    });

    it('archetype cards have tier common or powerful', () => {
      const archetypeCards = baseCards.filter(c => c.archetype);
      for (const card of archetypeCards) {
        expect(['common', 'powerful']).toContain(card.tier);
      }
    });
  });
});
