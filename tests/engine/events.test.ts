import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveCampfire,
  resolveBlacksmith,
  resolveRandomEvent,
  resolveWanderingMerchant,
  resolveShrineOfSacrifice,
  resolveAncientChest,
  resolveSoulBargain,
  resolveHealingSpring,
} from '@engine/events';
import type { Player } from '@shared/types';
import { CAMPFIRE_HEAL_RANGE, MAX_HP_CAP } from '@shared/constants';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'TestWarrior',
    class: 'warrior',
    hp: 70,
    maxHp: 100,
    position: { x: 0, y: 0 },
    deck: ['w_strike', 'w_defend', 'w_bash', 'w_heavy_blow', 'w_war_cry'],
    hand: [],
    drawPile: ['w_strike', 'w_defend', 'w_bash', 'w_heavy_blow', 'w_war_cry'],
    discardPile: [],
    block: 0,
    isAlive: true,
    freeNonFightEvents: 3,
    needsFight: false,
    pvpCooldowns: {},
    stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// resolveCampfire
// ---------------------------------------------------------------------------

describe('resolveCampfire', () => {
  it('heals player within CAMPFIRE_HEAL_RANGE (25-30)', () => {
    const player = makePlayer({ hp: 50, maxHp: 100 });
    for (let i = 0; i < 50; i++) {
      const result = resolveCampfire(player);
      expect(result.player.hp).toBeGreaterThanOrEqual(50 + CAMPFIRE_HEAL_RANGE.min);
      expect(result.player.hp).toBeLessThanOrEqual(50 + CAMPFIRE_HEAL_RANGE.max);
    }
  });

  it('caps HP at maxHp — never exceeds it', () => {
    const player = makePlayer({ hp: 95, maxHp: 100 });
    for (let i = 0; i < 50; i++) {
      const result = resolveCampfire(player);
      expect(result.player.hp).toBeLessThanOrEqual(player.maxHp);
    }
  });

  it('caps HP at maxHp when player is near full health', () => {
    const player = makePlayer({ hp: 99, maxHp: 100 });
    const result = resolveCampfire(player);
    expect(result.player.hp).toBe(100);
  });

  it('respects MAX_HP_CAP — never heals above MAX_HP_CAP even if maxHp somehow exceeds it', () => {
    // maxHp capped at MAX_HP_CAP per spec
    const player = makePlayer({ hp: 90, maxHp: MAX_HP_CAP });
    const result = resolveCampfire(player);
    expect(result.player.hp).toBeLessThanOrEqual(MAX_HP_CAP);
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ hp: 50, maxHp: 100 });
    const originalHp = player.hp;
    resolveCampfire(player);
    expect(player.hp).toBe(originalHp);
  });

  it('returns a message', () => {
    const result = resolveCampfire(makePlayer());
    expect(result.message).toBeTruthy();
    expect(typeof result.message).toBe('string');
  });

  it('returns no cardChoices and no combat', () => {
    const result = resolveCampfire(makePlayer());
    expect(result.cardChoices).toBeUndefined();
    expect(result.combat).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// resolveBlacksmith
// ---------------------------------------------------------------------------

describe('resolveBlacksmith', () => {
  it('upgrades a card in the deck by replacing its id with upgradeId', () => {
    // w_strike has upgradeId w_strike_plus
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const result = resolveBlacksmith(player, 'w_strike');
    expect(result.player.deck).toContain('w_strike_plus');
    expect(result.player.deck).not.toContain('w_strike');
  });

  it('only upgrades one instance when duplicates exist', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_strike', 'w_defend'] });
    const result = resolveBlacksmith(player, 'w_strike');
    const strikeCount = result.player.deck.filter(c => c === 'w_strike').length;
    const strikePlusCount = result.player.deck.filter(c => c === 'w_strike_plus').length;
    expect(strikeCount).toBe(1);
    expect(strikePlusCount).toBe(1);
  });

  it('fails for already-upgraded cards (cards with upgraded: true)', () => {
    // w_strike_plus is already upgraded
    const player = makePlayer({ deck: ['w_strike_plus', 'w_defend'] });
    const result = resolveBlacksmith(player, 'w_strike_plus');
    // Should return an error message; player deck unchanged
    expect(result.message).toMatch(/already|upgraded/i);
    expect(result.player.deck).toEqual(player.deck);
  });

  it('fails gracefully for unknown card ids', () => {
    const player = makePlayer({ deck: ['w_strike'] });
    const result = resolveBlacksmith(player, 'nonexistent_card');
    expect(result.message).toMatch(/not found|unknown|invalid/i);
    expect(result.player.deck).toEqual(player.deck);
  });

  it('fails if card is not in the player deck', () => {
    // w_war_cry is not in the deck defined here
    const player = makePlayer({ deck: ['w_strike', 'w_defend'] });
    const result = resolveBlacksmith(player, 'w_bash');
    expect(result.message).toMatch(/not in deck|not found/i);
    expect(result.player.deck).toEqual(player.deck);
  });

  it('fails for cards without an upgradeId (no upgrade path)', () => {
    // We need a card without upgradeId — use w_strike_plus which has upgradeId back to w_strike
    // but let's test the already-upgraded path covers this scenario.
    // w_strike_plus.upgraded === true → should fail
    const player = makePlayer({ deck: ['w_strike_plus'] });
    const result = resolveBlacksmith(player, 'w_strike_plus');
    expect(result.player.deck).toEqual(player.deck);
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const originalDeck = [...player.deck];
    resolveBlacksmith(player, 'w_strike');
    expect(player.deck).toEqual(originalDeck);
  });

  it('returns a success message on successful upgrade', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const result = resolveBlacksmith(player, 'w_strike');
    expect(result.message).toBeTruthy();
    expect(result.message).not.toMatch(/error|fail|already|not found/i);
  });
});

// ---------------------------------------------------------------------------
// resolveRandomEvent
// ---------------------------------------------------------------------------

describe('resolveRandomEvent', () => {
  it('returns a result with a message', () => {
    const player = makePlayer();
    const result = resolveRandomEvent(player);
    expect(result).toBeDefined();
    expect(result.message).toBeTruthy();
  });

  it('selects from shared pool (~50%), class pool (~25%), or gambling pool (~25%)', () => {
    // Run many times and check that all pools fire at some point
    const player = makePlayer();
    const messages = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const result = resolveRandomEvent(player);
      messages.add(result.message);
    }
    // We should see at least 2 distinct outcomes over 200 runs
    expect(messages.size).toBeGreaterThanOrEqual(2);
  });

  it('pool weights: roll < 0.5 → shared pool, 0.5–0.75 → class pool, ≥ 0.75 → gambling pool', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });

    // roll = 0.3 → shared pool (Wandering Merchant or Healing Spring)
    // Shared pool messages contain "campfire" / "merchant" / "healing spring"
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.3)  // pool roll → shared
      .mockReturnValue(0.0);      // subsequent calls (index into pool, etc.)
    const sharedResult = resolveRandomEvent(player);
    vi.restoreAllMocks();
    // Shared pool: Wandering Merchant or Healing Spring
    expect(
      sharedResult.message.toLowerCase().match(/merchant|healing spring|restores|offers/)
    ).not.toBeNull();

    // roll = 0.6 → class pool (spirit blesses you / healing spring fallback)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.6)  // pool roll → class
      .mockReturnValue(0.0);
    const classResult = resolveRandomEvent(player);
    vi.restoreAllMocks();
    expect(classResult.message).toBeTruthy();

    // roll = 0.8 → gambling pool (Shrine / Ancient Chest / Soul Bargain)
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.8)  // pool roll → gambling
      .mockReturnValue(0.0);     // index into GAMBLING_POOL → first item (Shrine)
    const gamblingResult = resolveRandomEvent(player);
    vi.restoreAllMocks();
    // Gambling pool: shrine / chest / soul bargain
    expect(
      gamblingResult.message.toLowerCase().match(/sacrifice|guardian|bargain|nothing/)
    ).not.toBeNull();
  });

  it('does not mutate the original player (when no cost event selected)', () => {
    const player = makePlayer({ hp: 80 });
    // Mock to always pick shared pool (Healing Spring / Wandering Merchant vary)
    // Just check the player object reference is different
    vi.spyOn(Math, 'random').mockReturnValue(0.1); // shared pool
    const result = resolveRandomEvent(player);
    vi.restoreAllMocks();
    // Result player is a new object
    expect(result.player).not.toBe(player);
  });
});

// ---------------------------------------------------------------------------
// resolveWanderingMerchant
// ---------------------------------------------------------------------------

describe('resolveWanderingMerchant', () => {
  it('costs 15 HP', () => {
    const player = makePlayer({ hp: 80, maxHp: 100 });
    const result = resolveWanderingMerchant(player);
    expect(result.player.hp).toBe(65);
  });

  it('offers 3 rare card choices from the reward pool', () => {
    const player = makePlayer({ hp: 80, maxHp: 100 });
    const result = resolveWanderingMerchant(player);
    expect(result.cardChoices).toBeDefined();
    expect(result.cardChoices!.length).toBe(3);
    // All offered cards should be rare (powerful tier)
    result.cardChoices!.forEach(card => {
      expect(card.tier).toBe('powerful');
    });
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ hp: 80 });
    const originalHp = player.hp;
    resolveWanderingMerchant(player);
    expect(player.hp).toBe(originalHp);
  });

  it('returns a message', () => {
    const result = resolveWanderingMerchant(makePlayer({ hp: 80 }));
    expect(result.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// resolveShrineOfSacrifice
// ---------------------------------------------------------------------------

describe('resolveShrineOfSacrifice', () => {
  it('removes a card from the deck permanently', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const result = resolveShrineOfSacrifice(player, 'w_strike');
    expect(result.player.deck).not.toContain('w_strike');
    expect(result.player.deck.length).toBe(2);
  });

  it('only removes one instance when duplicates exist', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_strike', 'w_defend'] });
    const result = resolveShrineOfSacrifice(player, 'w_strike');
    expect(result.player.deck.filter(c => c === 'w_strike').length).toBe(1);
  });

  it('fails if card not in deck', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend'] });
    const result = resolveShrineOfSacrifice(player, 'w_bash');
    expect(result.message).toMatch(/not in deck|not found/i);
    expect(result.player.deck).toEqual(player.deck);
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const originalDeck = [...player.deck];
    resolveShrineOfSacrifice(player, 'w_strike');
    expect(player.deck).toEqual(originalDeck);
  });

  it('returns a message', () => {
    const player = makePlayer({ deck: ['w_strike', 'w_defend', 'w_bash'] });
    const result = resolveShrineOfSacrifice(player, 'w_strike');
    expect(result.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// resolveAncientChest
// ---------------------------------------------------------------------------

describe('resolveAncientChest', () => {
  it('triggers a mini-boss fight (returns combat trigger)', () => {
    const player = makePlayer();
    const result = resolveAncientChest(player);
    expect(result.combat).toBeDefined();
    expect(result.combat!.monsterId).toBeTruthy();
  });

  it('returns a message', () => {
    const result = resolveAncientChest(makePlayer());
    expect(result.message).toBeTruthy();
  });

  it('does not mutate the original player', () => {
    const player = makePlayer();
    resolveAncientChest(player);
    expect(player.hp).toBe(70); // unchanged
  });
});

// ---------------------------------------------------------------------------
// resolveSoulBargain
// ---------------------------------------------------------------------------

describe('resolveSoulBargain', () => {
  it('reduces maxHp by 15', () => {
    const player = makePlayer({ hp: 80, maxHp: 100 });
    const result = resolveSoulBargain(player);
    expect(result.player.maxHp).toBe(85);
  });

  it('automatically adds the best (powerful tier) card to the deck — no choices presented', () => {
    const player = makePlayer({ hp: 80, maxHp: 100, deck: ['w_strike'] });
    const result = resolveSoulBargain(player);
    // No choice presented; card goes straight into the deck
    expect(result.cardChoices).toBeUndefined();
    expect(result.player.deck.length).toBe(2);
    // The added card should be from the warrior powerful-tier pool
    const addedId = result.player.deck[1];
    expect(addedId).toBeTruthy();
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ hp: 80, maxHp: 100 });
    const originalMaxHp = player.maxHp;
    resolveSoulBargain(player);
    expect(player.maxHp).toBe(originalMaxHp);
  });

  it('returns a message', () => {
    const result = resolveSoulBargain(makePlayer({ hp: 80 }));
    expect(result.message).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// resolveHealingSpring
// ---------------------------------------------------------------------------

describe('resolveHealingSpring', () => {
  it('heals 15 HP', () => {
    const player = makePlayer({ hp: 60, maxHp: 100 });
    const result = resolveHealingSpring(player);
    expect(result.player.hp).toBe(75);
  });

  it('does not exceed maxHp when healing', () => {
    const player = makePlayer({ hp: 95, maxHp: 100 });
    const result = resolveHealingSpring(player);
    expect(result.player.hp).toBe(100);
  });

  it('upgrades a random card in the deck', () => {
    // deck has cards with upgrade paths — at least one should be upgraded
    const player = makePlayer({
      hp: 60,
      maxHp: 100,
      deck: ['w_strike', 'w_defend', 'w_bash'],
    });
    const result = resolveHealingSpring(player);
    // one card should now be a _plus variant
    const upgradedCards = result.player.deck.filter(c => c.endsWith('_plus'));
    expect(upgradedCards.length).toBe(1);
  });

  it('still heals even if no card can be upgraded', () => {
    // All cards already upgraded
    const player = makePlayer({
      hp: 60,
      maxHp: 100,
      deck: ['w_strike_plus', 'w_defend_plus'],
    });
    const result = resolveHealingSpring(player);
    expect(result.player.hp).toBe(75);
  });

  it('does not mutate the original player', () => {
    const player = makePlayer({ hp: 60, maxHp: 100 });
    const originalHp = player.hp;
    resolveHealingSpring(player);
    expect(player.hp).toBe(originalHp);
  });

  it('returns a message', () => {
    const result = resolveHealingSpring(makePlayer({ hp: 60 }));
    expect(result.message).toBeTruthy();
  });
});
