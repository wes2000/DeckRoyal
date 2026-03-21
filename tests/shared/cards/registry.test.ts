import { describe, it, expect } from 'vitest';
import { getCardById, getCardsByClass, getStarterDeck, getRewardPool } from '@shared/cards';

describe('card registry', () => {
  it('looks up card by id', () => {
    const card = getCardById('w_strike');
    expect(card).toBeDefined();
    expect(card!.name).toBe('Strike');
  });

  it('returns undefined for unknown id', () => {
    expect(getCardById('nonexistent')).toBeUndefined();
  });

  it('gets all cards for a class', () => {
    const warriorCards = getCardsByClass('warrior');
    expect(warriorCards.length).toBeGreaterThan(0);
    expect(warriorCards.every(c => c.class === 'warrior')).toBe(true);
  });

  it('builds a starter deck for warrior', () => {
    const deck = getStarterDeck('warrior');
    expect(deck).toHaveLength(10);
    expect(deck.filter(id => id === 'w_strike')).toHaveLength(5);
    expect(deck.filter(id => id === 'w_defend')).toHaveLength(4);
    expect(deck.filter(id => id === 'w_bash')).toHaveLength(1);
  });

  it('builds a starter deck for mage', () => {
    const deck = getStarterDeck('mage');
    expect(deck).toHaveLength(10);
  });

  it('builds a starter deck for rogue', () => {
    const deck = getStarterDeck('rogue');
    expect(deck).toHaveLength(10);
  });

  it('gets small monster reward pool (non-starting basic + low-tier archetype)', () => {
    const pool = getRewardPool('warrior', 'small');
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.some(c => c.id === 'w_strike')).toBe(false);
    expect(pool.some(c => c.id === 'w_defend')).toBe(false);
    expect(pool.some(c => c.id === 'w_bash')).toBe(false);
    expect(pool.every(c => !c.upgraded)).toBe(true);
  });

  it('gets rare monster reward pool (powerful archetype)', () => {
    const pool = getRewardPool('warrior', 'rare');
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every(c => c.tier === 'powerful')).toBe(true);
    expect(pool.every(c => !c.upgraded)).toBe(true);
  });
});
