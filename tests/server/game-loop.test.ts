import { describe, it, expect, vi, beforeEach } from 'vitest';
import { tick } from '../../src/server/game-loop';
import type { GameState, Player, CombatState, EventTile, ZoneBoundary } from '../../src/shared/types';
import { ZONE_PHASES, ZONE_DAMAGE_PER_SECOND, SUDDEN_DEATH_DAMAGE_PER_SECOND, TURN_TIMER_SECONDS } from '../../src/shared/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePlayer(id: string, overrides: Partial<Player> = {}): Player {
  return {
    id,
    name: id,
    class: 'warrior',
    hp: 100,
    maxHp: 100,
    position: { x: 30, y: 30 }, // center of map — inside zone
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

function makeMap() {
  return {
    width: 60,
    height: 60,
    tiles: [],
  };
}

function makeFullBoundary(): ZoneBoundary {
  return { minX: 0, minY: 0, maxX: 59, maxY: 59 };
}

function makeGame(overrides: Partial<GameState> = {}): GameState {
  return {
    id: 'game1',
    phase: 'playing',
    players: { p1: makePlayer('p1'), p2: makePlayer('p2') },
    map: makeMap(),
    events: [],
    elapsed: 0,
    zonePhase: 0,
    zoneBoundary: makeFullBoundary(),
    combats: {},
    ...overrides,
  };
}

function makeCombat(id: string, overrides: Partial<CombatState> = {}): CombatState {
  return {
    id,
    type: 'pve',
    playerIds: ['p1'],
    activePlayerIndex: 0,
    turnCounters: { p1: 0 },
    round: 1,
    maxRounds: 10,
    damageTracker: {},
    damageCap: 20,
    turnTimer: 0,
    isComplete: false,
    ...overrides,
  };
}

function makeEvent(id: string, position = { x: 30, y: 30 }): EventTile {
  return { id, type: 'campfire', position, active: true };
}

// ─── tick: elapsed time ───────────────────────────────────────────────────────

describe('tick: advances elapsed time', () => {
  it('adds deltaTime to game.elapsed', () => {
    const game = makeGame({ elapsed: 0 });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.elapsed).toBeCloseTo(0.1);
  });

  it('accumulates elapsed across multiple ticks', () => {
    const game = makeGame({ elapsed: 5.0 });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.elapsed).toBeCloseTo(5.1);
  });

  it('does not mutate the original game state', () => {
    const game = makeGame({ elapsed: 0 });
    tick(game, 0.1, 100);
    expect(game.elapsed).toBe(0);
  });
});

// ─── tick: zone phase transitions ─────────────────────────────────────────────

describe('tick: zone phase transitions', () => {
  it('does not change zonePhase when threshold not crossed', () => {
    // Phase 1 starts at 330s. With elapsed=329 and delta=0.1, we reach 329.1 — no phase change
    const game = makeGame({ elapsed: 329.0, zonePhase: 0 });
    const { game: result, events } = tick(game, 0.1, 100);
    expect(result.zonePhase).toBe(0);
    expect(events.find(e => e.type === 'zonePhaseChanged')).toBeUndefined();
  });

  it('updates zonePhase when time threshold is crossed', () => {
    // Phase 1 starts at 330s. Tick from 329.9 + 0.2 = 330.1 crosses the boundary
    const game = makeGame({ elapsed: 329.9, zonePhase: 0 });
    const { game: result, events } = tick(game, 0.2, 100);
    expect(result.zonePhase).toBe(1);
    expect(events.some(e => e.type === 'zonePhaseChanged')).toBe(true);
  });

  it('emits zonePhaseChanged event with correct phase', () => {
    const game = makeGame({ elapsed: 329.9, zonePhase: 0 });
    const { events } = tick(game, 0.2, 100);
    const phaseEvent = events.find(e => e.type === 'zonePhaseChanged');
    expect(phaseEvent).toBeDefined();
    expect((phaseEvent as { type: 'zonePhaseChanged'; phase: number }).phase).toBe(1);
  });

  it('updates zoneBoundary when zone phase changes', () => {
    const game = makeGame({ elapsed: 329.9, zonePhase: 0 });
    const { game: result } = tick(game, 0.2, 100);
    // Phase 1 = 75% coverage, so the boundary shrinks
    expect(result.zoneBoundary.minX).toBeGreaterThan(0);
  });

  it('transitions from phase 1 to phase 2 at 540s', () => {
    const game = makeGame({ elapsed: 539.9, zonePhase: 1 });
    const { game: result } = tick(game, 0.2, 100);
    expect(result.zonePhase).toBe(2);
  });
});

// ─── tick: zone warning ───────────────────────────────────────────────────────

describe('tick: zone warning before shrink', () => {
  it('emits zoneWarning when within 30s of next phase', () => {
    // Phase 1 is at 330s. Warning fires when elapsed is between 300s and 330s.
    // Position at 300.5 — within warning window
    const game = makeGame({ elapsed: 300.5, zonePhase: 0 });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'zoneWarning')).toBe(true);
  });

  it('does not emit zoneWarning when outside warning window', () => {
    // Far from any transition
    const game = makeGame({ elapsed: 10, zonePhase: 0 });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'zoneWarning')).toBe(false);
  });

  it('zoneWarning includes nextPhase and timeUntil', () => {
    const game = makeGame({ elapsed: 300.5, zonePhase: 0 });
    const { events } = tick(game, 0.1, 100);
    const warning = events.find(e => e.type === 'zoneWarning') as
      | { type: 'zoneWarning'; nextPhase: number; timeUntil: number }
      | undefined;
    expect(warning).toBeDefined();
    expect(warning!.nextPhase).toBe(1);
    expect(warning!.timeUntil).toBeGreaterThan(0);
  });
});

// ─── tick: zone damage ────────────────────────────────────────────────────────

describe('tick: zone damage to players outside boundary', () => {
  it('does not damage players inside the zone', () => {
    const game = makeGame({
      players: { p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 100 }) },
      zoneBoundary: makeFullBoundary(),
    });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.players['p1'].hp).toBe(100);
  });

  it('applies zone damage per tick to players outside the zone', () => {
    // Shrink the boundary so player at (30,30) is outside
    const tightBoundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const game = makeGame({
      players: { p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 100 }) },
      zoneBoundary: tightBoundary,
    });
    const { game: result } = tick(game, 0.1, 100);
    // ZONE_DAMAGE_PER_SECOND * 0.1 = 0.5 damage
    const expectedHp = 100 - ZONE_DAMAGE_PER_SECOND * 0.1;
    expect(result.players['p1'].hp).toBeCloseTo(expectedHp);
  });

  it('emits playerDamaged event when player takes zone damage', () => {
    const tightBoundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const game = makeGame({
      players: { p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 100 }) },
      zoneBoundary: tightBoundary,
    });
    const { events } = tick(game, 0.1, 100);
    const dmgEvent = events.find(e => e.type === 'playerDamaged' && (e as { playerId: string }).playerId === 'p1');
    expect(dmgEvent).toBeDefined();
    expect((dmgEvent as { source: string }).source).toBe('zone');
  });

  it('eliminates player when zone damage reduces HP to 0', () => {
    const tightBoundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const game = makeGame({
      players: {
        p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 0.4 }),
        p2: makePlayer('p2'),
      },
      zoneBoundary: tightBoundary,
    });
    // 0.4hp - (5 * 0.1) = 0.4 - 0.5 = -0.1 → eliminate
    const { game: result, events } = tick(game, 0.1, 100);
    expect(result.players['p1'].isAlive).toBe(false);
    expect(events.some(e => e.type === 'playerEliminated' && (e as { playerId: string }).playerId === 'p1')).toBe(true);
  });

  it('does not damage dead players', () => {
    const tightBoundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
    const game = makeGame({
      players: {
        p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 50, isAlive: false }),
        p2: makePlayer('p2'),
      },
      zoneBoundary: tightBoundary,
    });
    const { game: result } = tick(game, 0.1, 100);
    // Dead player's HP should remain unchanged
    expect(result.players['p1'].hp).toBe(50);
  });
});

// ─── tick: destroy events outside zone ────────────────────────────────────────

describe('tick: destroy events outside zone boundary', () => {
  it('does not destroy events inside the zone', () => {
    const event = makeEvent('e1', { x: 3, y: 3 });
    const boundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const game = makeGame({ events: [event], zoneBoundary: boundary });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.events[0].active).toBe(true);
  });

  it('deactivates events outside the zone boundary', () => {
    const event = makeEvent('e1', { x: 50, y: 50 });
    const boundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const game = makeGame({ events: [event], zoneBoundary: boundary });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.events[0].active).toBe(false);
  });

  it('emits eventDestroyed for each deactivated event', () => {
    const e1 = makeEvent('e1', { x: 50, y: 50 });
    const e2 = makeEvent('e2', { x: 55, y: 55 });
    const boundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const game = makeGame({ events: [e1, e2], zoneBoundary: boundary });
    const { events } = tick(game, 0.1, 100);
    const destroyed = events.filter(e => e.type === 'eventDestroyed');
    expect(destroyed).toHaveLength(2);
    const ids = destroyed.map(e => (e as { eventId: string }).eventId);
    expect(ids).toContain('e1');
    expect(ids).toContain('e2');
  });

  it('does not emit eventDestroyed for already-inactive events', () => {
    // Already inactive event outside zone — should not emit a second destruction event
    const event: EventTile = { id: 'e1', type: 'campfire', position: { x: 50, y: 50 }, active: false };
    const boundary: ZoneBoundary = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const game = makeGame({ events: [event], zoneBoundary: boundary });
    const { events: result } = tick(game, 0.1, 100);
    expect(result.filter(e => e.type === 'eventDestroyed')).toHaveLength(0);
  });
});

// ─── tick: turn timers ────────────────────────────────────────────────────────

describe('tick: check turn timers for active combats', () => {
  it('does not interfere with combats whose timer has not expired', () => {
    const combat = makeCombat('c1', { turnTimer: 200, isComplete: false });
    const game = makeGame({ combats: { c1: combat } });
    // currentTime=100 < turnTimer=200, so no auto-end
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'turnAutoEnded')).toBe(false);
  });

  it('emits turnAutoEnded when turn timer expires', () => {
    // turnTimer=50, currentTime=100 → timer expired
    const combat = makeCombat('c1', { turnTimer: 50, playerIds: ['p1'], activePlayerIndex: 0, isComplete: false });
    const game = makeGame({ combats: { c1: combat } });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'turnAutoEnded')).toBe(true);
  });

  it('includes combatId and playerId in turnAutoEnded event', () => {
    const combat = makeCombat('c1', { turnTimer: 50, playerIds: ['p1'], activePlayerIndex: 0, isComplete: false });
    const game = makeGame({ combats: { c1: combat } });
    const { events } = tick(game, 0.1, 100);
    const autoEnd = events.find(e => e.type === 'turnAutoEnded') as
      | { type: 'turnAutoEnded'; combatId: string; playerId: string }
      | undefined;
    expect(autoEnd?.combatId).toBe('c1');
    expect(autoEnd?.playerId).toBe('p1');
  });

  it('skips completed combats', () => {
    const combat = makeCombat('c1', { turnTimer: 50, isComplete: true });
    const game = makeGame({ combats: { c1: combat } });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'turnAutoEnded')).toBe(false);
  });
});

// ─── tick: win condition ──────────────────────────────────────────────────────

describe('tick: win condition (1 player alive)', () => {
  it('does not emit gameOver when multiple players are alive', () => {
    const game = makeGame({
      players: { p1: makePlayer('p1'), p2: makePlayer('p2') },
    });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'gameOver')).toBe(false);
  });

  it('emits gameOver with winner ID when only 1 player is alive', () => {
    const game = makeGame({
      players: {
        p1: makePlayer('p1', { isAlive: false }),
        p2: makePlayer('p2'),
      },
    });
    const { events } = tick(game, 0.1, 100);
    const gameOver = events.find(e => e.type === 'gameOver') as
      | { type: 'gameOver'; winnerId: string }
      | undefined;
    expect(gameOver).toBeDefined();
    expect(gameOver!.winnerId).toBe('p2');
  });

  it('does not emit gameOver when 0 players are alive', () => {
    const game = makeGame({
      players: {
        p1: makePlayer('p1', { isAlive: false }),
        p2: makePlayer('p2', { isAlive: false }),
      },
    });
    const { events } = tick(game, 0.1, 100);
    expect(events.some(e => e.type === 'gameOver')).toBe(false);
  });
});

// ─── tick: sudden death ───────────────────────────────────────────────────────

describe('tick: sudden death damage (phase 5)', () => {
  it('applies sudden death damage to all players regardless of position in phase 5', () => {
    // Phase 5 starts at 1080s
    const game = makeGame({
      elapsed: 1080,
      zonePhase: 5,
      players: {
        p1: makePlayer('p1', { position: { x: 30, y: 30 }, hp: 100 }), // inside zone
        p2: makePlayer('p2', { position: { x: 1, y: 1 }, hp: 100 }),   // also "inside" small zone
      },
      zoneBoundary: makeFullBoundary(), // full boundary — everyone is "inside"
    });
    const { game: result } = tick(game, 1.0, 100);
    // In sudden death all players take SUDDEN_DEATH_DAMAGE_PER_SECOND per second
    expect(result.players['p1'].hp).toBeCloseTo(100 - SUDDEN_DEATH_DAMAGE_PER_SECOND);
    expect(result.players['p2'].hp).toBeCloseTo(100 - SUDDEN_DEATH_DAMAGE_PER_SECOND);
  });

  it('emits playerDamaged with source sudden_death in phase 5', () => {
    const game = makeGame({
      elapsed: 1080,
      zonePhase: 5,
      players: { p1: makePlayer('p1', { hp: 100 }), p2: makePlayer('p2', { hp: 100 }) },
      zoneBoundary: makeFullBoundary(),
    });
    const { events } = tick(game, 1.0, 100);
    const dmgEvents = events.filter(
      e => e.type === 'playerDamaged' && (e as { source: string }).source === 'sudden_death',
    );
    expect(dmgEvents.length).toBe(2);
  });
});

// ─── tick: solo mode ──────────────────────────────────────────────────────────

describe('tick: solo mode (1 player in game)', () => {
  it('does not shrink zone in solo mode (zonePhase stays 0)', () => {
    // Cross into phase 1 territory, but solo mode — zone should not shrink
    const game = makeGame({
      elapsed: 329.9,
      zonePhase: 0,
      players: { p1: makePlayer('p1') },
    });
    const { game: result, events } = tick(game, 0.2, 100);
    expect(result.zonePhase).toBe(0);
    expect(events.some(e => e.type === 'zonePhaseChanged')).toBe(false);
  });

  it('zoneBoundary does not change in solo mode', () => {
    const initialBoundary = makeFullBoundary();
    const game = makeGame({
      elapsed: 329.9,
      zonePhase: 0,
      zoneBoundary: initialBoundary,
      players: { p1: makePlayer('p1') },
    });
    const { game: result } = tick(game, 0.2, 100);
    expect(result.zoneBoundary).toEqual(initialBoundary);
  });

  it('solo mode still advances elapsed time', () => {
    const game = makeGame({
      elapsed: 0,
      players: { p1: makePlayer('p1') },
    });
    const { game: result } = tick(game, 0.1, 100);
    expect(result.elapsed).toBeCloseTo(0.1);
  });
});
