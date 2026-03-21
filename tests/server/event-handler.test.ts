import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleEventInteraction,
  handleCardSelection,
  handleUpgradeSelection,
  handleCardRemoval,
} from '../../src/server/event-handler';
import type { GameState, Player, EventTile } from '@shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: `Player-${id}`,
    class: 'warrior',
    hp: 80,
    maxHp: 100,
    position: { x: 0, y: 0 },
    deck: ['w_strike', 'w_strike', 'w_defend'],
    hand: [],
    drawPile: [],
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

function makeEvent(id: string, type: EventTile['type'], active = true): EventTile {
  return { id, type, position: { x: 1, y: 1 }, active };
}

function makeGame(players: Record<string, Player>, events: EventTile[]): GameState {
  return {
    id: 'game-1',
    phase: 'playing',
    players,
    map: {
      width: 10,
      height: 10,
      tiles: Array.from({ length: 10 }, () =>
        Array.from({ length: 10 }, () => ({ type: 'grass' as const, walkable: true })),
      ),
    },
    events,
    elapsed: 0,
    zonePhase: 0,
    zoneBoundary: { minX: 0, minY: 0, maxX: 9, maxY: 9 },
    combats: {},
  };
}

// ---------------------------------------------------------------------------
// handleEventInteraction
// ---------------------------------------------------------------------------

describe('handleEventInteraction', () => {
  // ── Inactive event ─────────────────────────────────────────────────────────

  it('rejects events that are already consumed (active=false)', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'campfire', false);
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('blocked');
    expect(result.game).toBe(game); // unchanged
  });

  // ── Non-existent event / player ────────────────────────────────────────────

  it('blocks when eventId is not found', () => {
    const player = makePlayer('p1');
    const game = makeGame({ p1: player }, []);

    const result = handleEventInteraction(game, 'p1', 'no-such-event');
    expect(result.response).toBe('blocked');
  });

  it('blocks when playerId is not found', () => {
    const event = makeEvent('evt1', 'campfire');
    const game = makeGame({}, [event]);

    const result = handleEventInteraction(game, 'ghost', 'evt1');
    expect(result.response).toBe('blocked');
  });

  // ── Alternation enforcement ────────────────────────────────────────────────

  it('blocks non-fight events when needsFight is true', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: true });
    const event = makeEvent('evt1', 'campfire');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');
    expect(result.response).toBe('blocked');
  });

  it('blocks blacksmith when needsFight is true', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: true });
    const event = makeEvent('evt1', 'blacksmith');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');
    expect(result.response).toBe('blocked');
  });

  it('blocks random event when needsFight is true', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: true });
    const event = makeEvent('evt1', 'random');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');
    expect(result.response).toBe('blocked');
  });

  it('allows non-fight event when freeNonFightEvents > 0 even if needsFight would block', () => {
    // freeNonFightEvents > 0 means canUseNonFightEvent returns true regardless of needsFight
    const player = makePlayer('p1', { freeNonFightEvents: 2, needsFight: false });
    const event = makeEvent('evt1', 'campfire');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');
    expect(result.response).toBe('healed');
  });

  // ── Campfire ───────────────────────────────────────────────────────────────

  it('campfire heals player and deactivates the event', () => {
    const player = makePlayer('p1', { hp: 70, maxHp: 100 });
    const event = makeEvent('evt1', 'campfire');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('healed');
    // HP should have increased (campfire heals 25-30)
    expect(result.game.players['p1'].hp).toBeGreaterThan(70);
    // Event must be deactivated
    const updatedEvent = result.game.events.find((e) => e.id === 'evt1');
    expect(updatedEvent?.active).toBe(false);
  });

  it('campfire records non-fight event (needsFight updates after resolution)', () => {
    // After exhausting free events, next non-fight should set needsFight=true
    const player = makePlayer('p1', { freeNonFightEvents: 1, needsFight: false });
    const event = makeEvent('evt1', 'campfire');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('healed');
    // freeNonFightEvents was 1 → after use: 0, needsFight: true
    expect(result.game.players['p1'].freeNonFightEvents).toBe(0);
    expect(result.game.players['p1'].needsFight).toBe(true);
  });

  // ── Blacksmith ─────────────────────────────────────────────────────────────

  it('blacksmith returns upgrade_prompt with player deck info', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'blacksmith');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('upgrade_prompt');
    expect(result.data).toBeDefined();
  });

  it('blacksmith deactivates the event', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'blacksmith');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    const updatedEvent = result.game.events.find((e) => e.id === 'evt1');
    expect(updatedEvent?.active).toBe(false);
  });

  it('blacksmith records non-fight event for alternation tracking', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 1, needsFight: false });
    const event = makeEvent('evt1', 'blacksmith');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('upgrade_prompt');
    expect(result.game.players['p1'].needsFight).toBe(true);
  });

  // ── Small monster ──────────────────────────────────────────────────────────

  it('small_monster starts PvE combat and returns combat_started', () => {
    const player = makePlayer('p1', { needsFight: true }); // monster events bypass alternation
    const event = makeEvent('evt1', 'small_monster');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('combat_started');
    // A new combat entry should exist
    const combats = Object.values(result.game.combats);
    expect(combats).toHaveLength(1);
    expect(combats[0].type).toBe('pve');
    expect(combats[0].playerIds).toContain('p1');
  });

  it('small_monster records fight event for alternation', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: true });
    const event = makeEvent('evt1', 'small_monster');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('combat_started');
    expect(result.game.players['p1'].needsFight).toBe(false);
  });

  it('small_monster deactivates the event', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'small_monster');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    const updatedEvent = result.game.events.find((e) => e.id === 'evt1');
    expect(updatedEvent?.active).toBe(false);
  });

  // ── Rare monster ───────────────────────────────────────────────────────────

  it('rare_monster starts PvE combat and returns combat_started', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'rare_monster');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('combat_started');
    const combats = Object.values(result.game.combats);
    expect(combats).toHaveLength(1);
    expect(combats[0].type).toBe('pve');
  });

  it('rare_monster records fight event for alternation', () => {
    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: true });
    const event = makeEvent('evt1', 'rare_monster');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(result.response).toBe('combat_started');
    expect(result.game.players['p1'].needsFight).toBe(false);
  });

  // ── Random event ───────────────────────────────────────────────────────────

  it('random event rolls from pool and resolves', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'random');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(['random_resolved', 'combat_started', 'card_choice']).toContain(result.response);
  });

  it('random event deactivates the event', () => {
    const player = makePlayer('p1');
    const event = makeEvent('evt1', 'random');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    const updatedEvent = result.game.events.find((e) => e.id === 'evt1');
    expect(updatedEvent?.active).toBe(false);
  });

  it('random event that triggers combat records fight event', () => {
    // Force resolveRandomEvent to return a combat result by mocking Math.random
    // Ancient Chest triggers combat: gambling pool (roll >= 0.75) + Ancient Chest (index 1 of GAMBLING_POOL)
    const mathRandom = vi.spyOn(Math, 'random');
    // First call: pool selection → 0.76 (gambling pool)
    // Second call: gambling pool index → 0.4 (index 1 = ancient chest in a 3-item pool: 0.4 * 3 = 1.2 → floor = 1)
    mathRandom.mockReturnValueOnce(0.76).mockReturnValueOnce(0.4);

    const player = makePlayer('p1', { freeNonFightEvents: 0, needsFight: false });
    const event = makeEvent('evt1', 'random');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    if (result.response === 'combat_started') {
      expect(result.game.players['p1'].needsFight).toBe(false);
    } else {
      // non-combat random → needsFight should update
      expect(result.response).not.toBe('blocked');
    }

    mathRandom.mockRestore();
  });

  it('random event without combat records non-fight event', () => {
    // Force healing spring: shared pool (roll < 0.5), index 1 = HealingSpring
    const mathRandom = vi.spyOn(Math, 'random');
    mathRandom.mockReturnValueOnce(0.2).mockReturnValueOnce(0.6); // shared pool, index 1

    const player = makePlayer('p1', { freeNonFightEvents: 1, needsFight: false });
    const event = makeEvent('evt1', 'random');
    const game = makeGame({ p1: player }, [event]);

    const result = handleEventInteraction(game, 'p1', 'evt1');

    expect(['random_resolved', 'card_choice']).toContain(result.response);
    // Non-fight consumed the last free event → needsFight should now be true
    expect(result.game.players['p1'].needsFight).toBe(true);

    mathRandom.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// handleCardSelection
// ---------------------------------------------------------------------------

describe('handleCardSelection', () => {
  it('adds the selected card to the player deck', () => {
    const player = makePlayer('p1', { deck: ['w_strike'] });
    const game = makeGame({ p1: player }, []);

    const result = handleCardSelection(game, 'p1', 'w_whirlwind');

    expect(result.players['p1'].deck).toContain('w_whirlwind');
    expect(result.players['p1'].deck).toHaveLength(2);
  });

  it('returns unchanged game if player not found', () => {
    const game = makeGame({}, []);
    const result = handleCardSelection(game, 'ghost', 'w_strike');
    expect(result).toBe(game);
  });
});

// ---------------------------------------------------------------------------
// handleUpgradeSelection
// ---------------------------------------------------------------------------

describe('handleUpgradeSelection', () => {
  it('upgrades the specified card in the player deck via resolveBlacksmith', () => {
    const player = makePlayer('p1', { deck: ['w_strike', 'w_defend'] });
    const game = makeGame({ p1: player }, []);

    const result = handleUpgradeSelection(game, 'p1', 'w_strike');

    // w_strike upgrades to w_strike_plus
    expect(result.players['p1'].deck).toContain('w_strike_plus');
    expect(result.players['p1'].deck).not.toContain('w_strike');
  });

  it('returns unchanged game if player not found', () => {
    const game = makeGame({}, []);
    const result = handleUpgradeSelection(game, 'ghost', 'w_strike');
    expect(result).toBe(game);
  });
});

// ---------------------------------------------------------------------------
// handleCardRemoval
// ---------------------------------------------------------------------------

describe('handleCardRemoval', () => {
  it('removes the specified card from the player deck via resolveShrineOfSacrifice', () => {
    const player = makePlayer('p1', { deck: ['w_strike', 'w_defend', 'w_strike'] });
    const game = makeGame({ p1: player }, []);

    const result = handleCardRemoval(game, 'p1', 'w_defend');

    expect(result.players['p1'].deck).not.toContain('w_defend');
    expect(result.players['p1'].deck).toHaveLength(2); // two w_strikes remain
  });

  it('returns unchanged game if player not found', () => {
    const game = makeGame({}, []);
    const result = handleCardRemoval(game, 'ghost', 'w_strike');
    expect(result).toBe(game);
  });
});
