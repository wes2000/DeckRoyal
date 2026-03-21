import { describe, it, expect } from 'vitest';
import {
  handleDisconnect,
  handleReconnect,
  checkDisconnectTimers,
  migrateHost,
} from '../../src/server/disconnect-handler';
import type { GameState, Player, CombatState } from '../../src/shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'Alice',
    class: 'warrior',
    hp: 100,
    maxHp: 100,
    position: { x: 5, y: 5 },
    deck: [],
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

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game1',
    phase: 'playing',
    players: {
      p1: makePlayer({ id: 'p1' }),
      p2: makePlayer({ id: 'p2', name: 'Bob' }),
    },
    map: { width: 60, height: 60, tiles: [] },
    events: [],
    elapsed: 0,
    zonePhase: 0,
    zoneBoundary: { minX: 0, minY: 0, maxX: 59, maxY: 59 },
    combats: {},
    ...overrides,
  };
}

function makePvECombat(playerId: string, overrides: Partial<CombatState> = {}): CombatState {
  return {
    id: 'combat1',
    type: 'pve',
    playerIds: [playerId],
    activePlayerIndex: 0,
    turnCounters: { [playerId]: 1 },
    round: 1,
    maxRounds: 10,
    damageTracker: {},
    damageCap: 50,
    monster: {
      id: 'monster1',
      name: 'Goblin',
      hp: 30,
      maxHp: 30,
      block: 0,
      patternIndex: 0,
      buffs: {},
    },
    turnTimer: 9999,
    isComplete: false,
    ...overrides,
  };
}

function makePvPCombat(p1Id: string, p2Id: string, overrides: Partial<CombatState> = {}): CombatState {
  return {
    id: 'combat1',
    type: 'pvp',
    playerIds: [p1Id, p2Id],
    activePlayerIndex: 0,
    turnCounters: { [p1Id]: 1, [p2Id]: 0 },
    round: 1,
    maxRounds: 10,
    damageTracker: {},
    damageCap: 50,
    turnTimer: 9999,
    isComplete: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleDisconnect — overworld context
// ---------------------------------------------------------------------------

describe('handleDisconnect — overworld', () => {
  it('returns a 30-second timer when player is in overworld', () => {
    const game = makeGame();
    const currentTime = 1000;

    const { timer } = handleDisconnect(game, 'p1', currentTime);

    expect(timer.playerId).toBe('p1');
    expect(timer.context).toBe('overworld');
    expect(timer.disconnectedAt).toBe(currentTime);
    expect(timer.timeout).toBe(30);
  });

  it('does not immediately eliminate the player on disconnect', () => {
    const game = makeGame();
    const { game: updated } = handleDisconnect(game, 'p1', 1000);
    expect(updated.players['p1'].isAlive).toBe(true);
  });

  it('does not mutate original game state', () => {
    const game = makeGame();
    handleDisconnect(game, 'p1', 1000);
    expect(game.players['p1'].isAlive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// handleDisconnect — PvP context
// ---------------------------------------------------------------------------

describe('handleDisconnect — PvP context', () => {
  it('returns a timer with pvp context when player is in PvP combat', () => {
    const combat = makePvPCombat('p1', 'p2');
    const game = makeGame({ combats: { combat1: combat } });

    const { timer } = handleDisconnect(game, 'p1', 1000);

    expect(timer.context).toBe('pvp');
  });

  it('uses 30-second timeout for PvP (turns auto-pass)', () => {
    const combat = makePvPCombat('p1', 'p2');
    const game = makeGame({ combats: { combat1: combat } });

    const { timer } = handleDisconnect(game, 'p1', 1000);

    expect(timer.timeout).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// handleDisconnect — PvE context
// ---------------------------------------------------------------------------

describe('handleDisconnect — PvE context', () => {
  it('returns a 15-second timer when player is in PvE combat', () => {
    const combat = makePvECombat('p1');
    const game = makeGame({ combats: { combat1: combat } });

    const { timer } = handleDisconnect(game, 'p1', 1000);

    expect(timer.context).toBe('pve');
    expect(timer.timeout).toBe(15);
  });
});

// ---------------------------------------------------------------------------
// handleReconnect
// ---------------------------------------------------------------------------

describe('handleReconnect', () => {
  it('resumes player — isAlive stays true after reconnect', () => {
    const game = makeGame();
    const { game: afterDisconnect } = handleDisconnect(game, 'p1', 1000);
    const afterReconnect = handleReconnect(afterDisconnect, 'p1');

    expect(afterReconnect.players['p1'].isAlive).toBe(true);
  });

  it('returns game unchanged if player not found', () => {
    const game = makeGame();
    const result = handleReconnect(game, 'nonexistent');
    expect(result).toEqual(game);
  });
});

// ---------------------------------------------------------------------------
// checkDisconnectTimers — overworld (30s timeout → eliminate)
// ---------------------------------------------------------------------------

describe('checkDisconnectTimers — overworld timeout', () => {
  it('eliminates a player when overworld timer expires after 30 seconds', () => {
    const game = makeGame();
    const disconnectedAt = 1000;
    const { timer } = handleDisconnect(game, 'p1', disconnectedAt);

    // 31 seconds later — timer expired
    const currentTime = disconnectedAt + 31 * 1000;
    const { game: updated, expired } = checkDisconnectTimers(game, [timer], currentTime);

    expect(expired).toContain('p1');
    expect(updated.players['p1'].isAlive).toBe(false);
  });

  it('does not eliminate player before 30-second overworld timeout', () => {
    const game = makeGame();
    const disconnectedAt = 1000;
    const { timer } = handleDisconnect(game, 'p1', disconnectedAt);

    // 10 seconds later — timer still running
    const currentTime = disconnectedAt + 10 * 1000;
    const { game: updated, expired } = checkDisconnectTimers(game, [timer], currentTime);

    expect(expired).not.toContain('p1');
    expect(updated.players['p1'].isAlive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkDisconnectTimers — PvE timeout (15s → eliminate)
// ---------------------------------------------------------------------------

describe('checkDisconnectTimers — PvE timeout', () => {
  it('eliminates a player when PvE timer expires after 15 seconds', () => {
    const combat = makePvECombat('p1');
    const game = makeGame({ combats: { combat1: combat } });
    const disconnectedAt = 1000;
    const { timer } = handleDisconnect(game, 'p1', disconnectedAt);

    expect(timer.context).toBe('pve');
    expect(timer.timeout).toBe(15);

    // 16 seconds later — timer expired
    const currentTime = disconnectedAt + 16 * 1000;
    const { game: updated, expired } = checkDisconnectTimers(game, [timer], currentTime);

    expect(expired).toContain('p1');
    expect(updated.players['p1'].isAlive).toBe(false);
  });

  it('does not eliminate PvE player within 15-second window', () => {
    const combat = makePvECombat('p1');
    const game = makeGame({ combats: { combat1: combat } });
    const disconnectedAt = 1000;
    const { timer } = handleDisconnect(game, 'p1', disconnectedAt);

    const currentTime = disconnectedAt + 5 * 1000;
    const { game: updated, expired } = checkDisconnectTimers(game, [timer], currentTime);

    expect(expired).not.toContain('p1');
    expect(updated.players['p1'].isAlive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkDisconnectTimers — PvP (turns auto-pass, no elimination on timeout)
// ---------------------------------------------------------------------------

describe('checkDisconnectTimers — PvP auto-pass', () => {
  it('does not eliminate PvP disconnected player on timeout — adds to expired for turn-pass handling', () => {
    const combat = makePvPCombat('p1', 'p2');
    const game = makeGame({ combats: { combat1: combat } });
    const disconnectedAt = 1000;
    const { timer } = handleDisconnect(game, 'p1', disconnectedAt);

    expect(timer.context).toBe('pvp');

    // 31 seconds later
    const currentTime = disconnectedAt + 31 * 1000;
    const { game: updated, expired } = checkDisconnectTimers(game, [timer], currentTime);

    // Player should still be alive (turns auto-pass, not eliminated)
    expect(updated.players['p1'].isAlive).toBe(true);
    // But should be in expired so the server knows to auto-pass the turn
    expect(expired).toContain('p1');
  });
});

// ---------------------------------------------------------------------------
// checkDisconnectTimers — multiple timers
// ---------------------------------------------------------------------------

describe('checkDisconnectTimers — multiple timers', () => {
  it('handles multiple timers and only expires those past their deadline', () => {
    const game = makeGame();
    const currentTime = 60_000; // fixed reference point
    // p1 disconnected 32s ago — timer expired
    const t1 = currentTime - 32 * 1000;
    // p2 disconnected 2s ago — timer still running
    const t2 = currentTime - 2 * 1000;

    const { timer: timer1 } = handleDisconnect(game, 'p1', t1);
    const { timer: timer2 } = handleDisconnect(game, 'p2', t2);

    const { game: updated, expired } = checkDisconnectTimers(game, [timer1, timer2], currentTime);

    expect(expired).toContain('p1');
    expect(expired).not.toContain('p2');
    expect(updated.players['p1'].isAlive).toBe(false);
    expect(updated.players['p2'].isAlive).toBe(true);
  });

  it('returns empty expired list when no timers have expired', () => {
    const game = makeGame();
    const { timer } = handleDisconnect(game, 'p1', 1000);

    const { expired } = checkDisconnectTimers(game, [timer], 1001);
    expect(expired).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// migrateHost
// ---------------------------------------------------------------------------

describe('migrateHost', () => {
  it('returns a GameState (host migration is a lobby concern — game state unchanged)', () => {
    const game = makeGame();
    const result = migrateHost(game, 'p1');
    // migrateHost is a lobby-level concern; game state itself is returned unchanged
    expect(result).toBeDefined();
    expect(result.id).toBe(game.id);
  });

  it('returns game unchanged if disconnected host id is not a player', () => {
    const game = makeGame();
    const result = migrateHost(game, 'nonexistent');
    expect(result).toEqual(game);
  });

  it('returns game with same players when host disconnects', () => {
    const game = makeGame();
    const result = migrateHost(game, 'p1');
    // All players should still be present
    expect(Object.keys(result.players)).toHaveLength(Object.keys(game.players).length);
  });
});
