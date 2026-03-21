import { describe, it, expect } from 'vitest';
import { canUseNonFightEvent, recordNonFightEvent, recordFightEvent } from '@engine/event-alternation';
import type { Player } from '@shared/types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1', name: 'Test', class: 'warrior', hp: 100, maxHp: 100,
    position: { x: 0, y: 0 }, deck: [], hand: [], drawPile: [], discardPile: [],
    block: 0, isAlive: true, freeNonFightEvents: 3, needsFight: false,
    pvpCooldowns: {}, stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    ...overrides,
  };
}

describe('event alternation', () => {
  it('allows first 3 non-fight events freely', () => {
    let player = makePlayer();
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // freeNonFightEvents: 2
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 1
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 0, needsFight: true
    expect(canUseNonFightEvent(player)).toBe(false);
  });

  it('requires fight after 3 free events', () => {
    let player = makePlayer({ freeNonFightEvents: 0, needsFight: true });
    expect(canUseNonFightEvent(player)).toBe(false);
    player = recordFightEvent(player);
    expect(canUseNonFightEvent(player)).toBe(true);
  });

  it('fight unlocks next non-fight event', () => {
    let player = makePlayer({ freeNonFightEvents: 0, needsFight: true });
    player = recordFightEvent(player);
    expect(player.needsFight).toBe(false);
    player = recordNonFightEvent(player);
    expect(player.needsFight).toBe(true);
  });
});
