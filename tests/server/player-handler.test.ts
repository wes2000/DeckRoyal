import { describe, it, expect, beforeEach } from 'vitest';
import {
  movePlayer,
  getNewPosition,
  canMove,
  isOnCooldown,
} from '../../src/server/player-handler';
import type { MoveResult } from '../../src/server/player-handler';
import type { GameState, Player, GameMap, Tile, CombatState } from '@shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMap(width: number, height: number, walkable = true): GameMap {
  const tiles: Tile[][] = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      tiles[y][x] = { type: 'grass', walkable };
    }
  }
  return { width, height, tiles };
}

function makePlayer(id: string, x: number, y: number, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: `Player-${id}`,
    class: 'warrior',
    hp: 100,
    maxHp: 100,
    position: { x, y },
    deck: [],
    hand: [],
    drawPile: [],
    discardPile: [],
    block: 0,
    isAlive: true,
    freeNonFightEvents: 0,
    needsFight: false,
    pvpCooldowns: {},
    stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    ...overrides,
  };
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game-1',
    phase: 'playing',
    players: {},
    map: makeMap(10, 10),
    events: [],
    elapsed: 0,
    zonePhase: 0,
    zoneBoundary: { minX: 0, minY: 0, maxX: 9, maxY: 9 },
    combats: {},
    ...overrides,
  };
}

const T0 = 1000; // base "current time" ms

// ─── getNewPosition ───────────────────────────────────────────────────────────

describe('getNewPosition', () => {
  it('up decrements y', () => {
    expect(getNewPosition(5, 5, 'up')).toEqual({ x: 5, y: 4 });
  });
  it('down increments y', () => {
    expect(getNewPosition(5, 5, 'down')).toEqual({ x: 5, y: 6 });
  });
  it('left decrements x', () => {
    expect(getNewPosition(5, 5, 'left')).toEqual({ x: 4, y: 5 });
  });
  it('right increments x', () => {
    expect(getNewPosition(5, 5, 'right')).toEqual({ x: 6, y: 5 });
  });
});

// ─── canMove ──────────────────────────────────────────────────────────────────

describe('canMove', () => {
  it('returns true when all conditions met', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({ players: { p1: player } });
    expect(canMove(game, 'p1', 6, 5, T0)).toBe(true);
  });

  it('returns false when target x is out of bounds (< 0)', () => {
    const player = makePlayer('p1', 0, 5);
    const game = makeGame({ players: { p1: player } });
    expect(canMove(game, 'p1', -1, 5, T0)).toBe(false);
  });

  it('returns false when target x is out of bounds (>= width)', () => {
    const player = makePlayer('p1', 9, 5);
    const game = makeGame({ players: { p1: player } });
    expect(canMove(game, 'p1', 10, 5, T0)).toBe(false);
  });

  it('returns false when target y is out of bounds (< 0)', () => {
    const player = makePlayer('p1', 5, 0);
    const game = makeGame({ players: { p1: player } });
    expect(canMove(game, 'p1', 5, -1, T0)).toBe(false);
  });

  it('returns false when target y is out of bounds (>= height)', () => {
    const player = makePlayer('p1', 5, 9);
    const game = makeGame({ players: { p1: player } });
    expect(canMove(game, 'p1', 5, 10, T0)).toBe(false);
  });

  it('returns false when target tile is not walkable', () => {
    const player = makePlayer('p1', 5, 5);
    const map = makeMap(10, 10, true);
    map.tiles[5][6] = { type: 'rock', walkable: false };
    const game = makeGame({ players: { p1: player }, map });
    expect(canMove(game, 'p1', 6, 5, T0)).toBe(false);
  });

  it('returns false when player is in active combat', () => {
    const player = makePlayer('p1', 5, 5);
    const combat: CombatState = {
      id: 'c1',
      type: 'pve',
      playerIds: ['p1'],
      activePlayerIndex: 0,
      turnCounters: {},
      round: 1,
      maxRounds: 4,
      damageTracker: {},
      damageCap: 20,
      turnTimer: 30,
      isComplete: false,
    };
    const game = makeGame({ players: { p1: player }, combats: { c1: combat } });
    expect(canMove(game, 'p1', 6, 5, T0)).toBe(false);
  });

  it('allows move after combat is complete', () => {
    const player = makePlayer('p1', 5, 5);
    const combat: CombatState = {
      id: 'c1',
      type: 'pve',
      playerIds: ['p1'],
      activePlayerIndex: 0,
      turnCounters: {},
      round: 1,
      maxRounds: 4,
      damageTracker: {},
      damageCap: 20,
      turnTimer: 30,
      isComplete: true,
    };
    const game = makeGame({ players: { p1: player }, combats: { c1: combat } });
    expect(canMove(game, 'p1', 6, 5, T0)).toBe(true);
  });

  it('returns false when movement cooldown has not elapsed (< 200ms)', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({ players: { p1: player } });
    // First move at T0
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    // Attempt second move 100ms later (cooldown = 200ms)
    expect(canMove(result.game, 'p1', 6, 5, T0 + 100, T0)).toBe(false);
  });

  it('returns true when movement cooldown has elapsed (>= 200ms)', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({ players: { p1: player } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(canMove(result.game, 'p1', 7, 5, T0 + 200, T0 + 200)).toBe(true);
  });
});

// ─── isOnCooldown ─────────────────────────────────────────────────────────────

describe('isOnCooldown', () => {
  it('returns false when no cooldown exists between players', () => {
    const p1 = makePlayer('p1', 5, 5);
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    expect(isOnCooldown(game, 'p1', 'p2', T0)).toBe(false);
  });

  it('returns true when cooldown is still active (< 10s)', () => {
    const p1 = makePlayer('p1', 5, 5, { pvpCooldowns: { p2: T0 - 5000 } }); // 5s ago
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    expect(isOnCooldown(game, 'p1', 'p2', T0)).toBe(true);
  });

  it('returns false when cooldown has expired (>= 10s)', () => {
    const p1 = makePlayer('p1', 5, 5, { pvpCooldowns: { p2: T0 - 10000 } }); // exactly 10s
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    expect(isOnCooldown(game, 'p1', 'p2', T0)).toBe(false);
  });

  it('returns false when cooldown is more than 10s ago', () => {
    const p1 = makePlayer('p1', 5, 5, { pvpCooldowns: { p2: T0 - 15000 } });
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    expect(isOnCooldown(game, 'p1', 'p2', T0)).toBe(false);
  });
});

// ─── movePlayer ───────────────────────────────────────────────────────────────

describe('movePlayer', () => {
  it('updates player position on a valid move', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({ players: { p1: player } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.game.players['p1'].position).toEqual({ x: 6, y: 5 });
    expect(result.triggered).toBeUndefined();
  });

  it('does not move player when target tile is impassable', () => {
    const player = makePlayer('p1', 5, 5);
    const map = makeMap(10, 10, true);
    map.tiles[5][6] = { type: 'rock', walkable: false };
    const game = makeGame({ players: { p1: player }, map });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.game.players['p1'].position).toEqual({ x: 5, y: 5 });
  });

  it('does not move player when at map boundary (left edge)', () => {
    const player = makePlayer('p1', 0, 5);
    const game = makeGame({ players: { p1: player } });
    const result = movePlayer(game, 'p1', 'left', T0, T0);
    expect(result.game.players['p1'].position).toEqual({ x: 0, y: 5 });
  });

  it('does not move player when at map boundary (top edge)', () => {
    const player = makePlayer('p1', 5, 0);
    const game = makeGame({ players: { p1: player } });
    const result = movePlayer(game, 'p1', 'up', T0, T0);
    expect(result.game.players['p1'].position).toEqual({ x: 5, y: 0 });
  });

  it('does not move player while in active combat', () => {
    const player = makePlayer('p1', 5, 5);
    const combat: CombatState = {
      id: 'c1',
      type: 'pvp',
      playerIds: ['p1', 'p2'],
      activePlayerIndex: 0,
      turnCounters: {},
      round: 1,
      maxRounds: 4,
      damageTracker: {},
      damageCap: 20,
      turnTimer: 30,
      isComplete: false,
    };
    const game = makeGame({ players: { p1: player }, combats: { c1: combat } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.game.players['p1'].position).toEqual({ x: 5, y: 5 });
  });

  it('enforces 200ms movement cooldown (5 tiles/sec)', () => {
    const player = makePlayer('p1', 3, 5);
    const game = makeGame({ players: { p1: player } });
    // First move at T0
    const r1 = movePlayer(game, 'p1', 'right', T0, T0);
    expect(r1.game.players['p1'].position).toEqual({ x: 4, y: 5 });
    // Second move at T0 + 100ms — should be blocked
    const r2 = movePlayer(r1.game, 'p1', 'right', T0 + 100, T0);
    expect(r2.game.players['p1'].position).toEqual({ x: 4, y: 5 });
    // Third move at T0 + 200ms — should succeed
    const r3 = movePlayer(r2.game, 'p1', 'right', T0 + 200, T0);
    expect(r3.game.players['p1'].position).toEqual({ x: 5, y: 5 });
  });

  it('triggers event when walking onto a non-monster event tile', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({
      players: { p1: player },
      events: [
        { id: 'ev1', type: 'campfire', position: { x: 6, y: 5 }, active: true },
      ],
    });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBe('event');
    expect(result.eventId).toBe('ev1');
  });

  it('triggers pve when walking onto a small_monster event tile', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({
      players: { p1: player },
      events: [
        { id: 'ev-sm', type: 'small_monster', position: { x: 6, y: 5 }, active: true },
      ],
    });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBe('pve');
    expect(result.eventId).toBe('ev-sm');
  });

  it('triggers pve when walking onto a rare_monster event tile', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({
      players: { p1: player },
      events: [
        { id: 'ev-rm', type: 'rare_monster', position: { x: 6, y: 5 }, active: true },
      ],
    });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBe('pve');
    expect(result.eventId).toBe('ev-rm');
  });

  it('does not trigger inactive event tile', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({
      players: { p1: player },
      events: [
        { id: 'ev1', type: 'campfire', position: { x: 6, y: 5 }, active: false },
      ],
    });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBeUndefined();
  });

  it('triggers pvp when walking onto another player not in combat', () => {
    const p1 = makePlayer('p1', 5, 5);
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBe('pvp');
    expect(result.combatId).toBeDefined();
  });

  it('triggers bounce when walking onto a tile with players already in combat', () => {
    const p1 = makePlayer('p1', 5, 5);
    const p2 = makePlayer('p2', 6, 5);
    const p3 = makePlayer('p3', 7, 5);
    const combat: CombatState = {
      id: 'c1',
      type: 'pvp',
      playerIds: ['p2', 'p3'],
      activePlayerIndex: 0,
      turnCounters: {},
      round: 1,
      maxRounds: 4,
      damageTracker: {},
      damageCap: 20,
      turnTimer: 30,
      isComplete: false,
    };
    const game = makeGame({ players: { p1, p2, p3 }, combats: { c1: combat } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    expect(result.triggered).toBe('bounce');
    // p1 should NOT be at the contested tile (6,5)
    expect(result.game.players['p1'].position).not.toEqual({ x: 6, y: 5 });
  });

  it('does not trigger pvp when on cooldown with that player', () => {
    const p1 = makePlayer('p1', 5, 5, { pvpCooldowns: { p2: T0 - 3000 } }); // 3s ago, still on cd
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    const result = movePlayer(game, 'p1', 'right', T0, T0);
    // Should move but not trigger pvp
    expect(result.game.players['p1'].position).toEqual({ x: 6, y: 5 });
    expect(result.triggered).toBeUndefined();
  });

  it('pvp cooldown prevents re-engagement for 10 seconds', () => {
    const p1 = makePlayer('p1', 5, 5);
    const p2 = makePlayer('p2', 6, 5);
    const game = makeGame({ players: { p1, p2 } });
    // First engagement — sets cooldown
    const r1 = movePlayer(game, 'p1', 'right', T0, T0);
    expect(r1.triggered).toBe('pvp');
    // Move p1 away
    const gameAfter = {
      ...r1.game,
      players: {
        ...r1.game.players,
        p1: { ...r1.game.players['p1'], position: { x: 5, y: 5 } },
      },
    };
    // Try re-engaging at T0 + 5s — still on cooldown
    const r2 = movePlayer(gameAfter, 'p1', 'right', T0 + 5000, T0);
    expect(r2.triggered).toBeUndefined();
    // Try at T0 + 10s — cooldown expired, pvp triggers again
    const r3 = movePlayer(gameAfter, 'p1', 'right', T0 + 10000, T0);
    expect(r3.triggered).toBe('pvp');
  });

  it('applies zone damage to players outside the zone boundary', () => {
    // Player is at (0,0), zone boundary excludes them
    const player = makePlayer('p1', 0, 0);
    const game = makeGame({
      players: { p1: player },
      zoneBoundary: { minX: 2, minY: 2, maxX: 9, maxY: 9 },
    });
    // We need a valid move target inside the map (stay in-bounds for movement)
    // Actually test zone damage: player is outside zone and takes damage when any move happens
    // Simplest: player moves to (1, 0) still outside zone
    const map = makeMap(10, 10);
    const gameWithMap = { ...game, map };
    const result = movePlayer(gameWithMap, 'p1', 'right', T0, T0);
    // Player should take zone damage (ZONE_DAMAGE_PER_SECOND = 5 damage/sec)
    // Since we call once and damage is applied, hp should be reduced
    expect(result.game.players['p1'].hp).toBeLessThan(100);
  });
});

// ─── canMove with lastMoveTime parameter ──────────────────────────────────────

describe('canMove with lastMoveTime', () => {
  it('accepts an optional lastMoveTime for cooldown check', () => {
    const player = makePlayer('p1', 5, 5);
    const game = makeGame({ players: { p1: player } });
    // Without lastMoveTime (or with 0): no cooldown — should allow move
    expect(canMove(game, 'p1', 6, 5, T0, 0)).toBe(true);
    // With recent lastMoveTime: should block
    expect(canMove(game, 'p1', 6, 5, T0, T0 - 50)).toBe(false);
  });
});
