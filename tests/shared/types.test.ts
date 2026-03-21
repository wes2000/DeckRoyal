import { describe, it, expect } from 'vitest';
import type {
  PlayerClass,
  TileType,
  EventType,
  GamePhase,
  CombatType,
  CardType,
  Position,
  PlayerStats,
  Player,
  Tile,
  GameMap,
  EventTile,
  ZoneBoundary,
  MonsterState,
  CombatState,
  GameState,
} from '@shared/types';

describe('PlayerClass', () => {
  it('accepts valid player classes', () => {
    const classes: PlayerClass[] = ['warrior', 'mage', 'rogue'];
    expect(classes).toHaveLength(3);
    expect(classes).toContain('warrior');
    expect(classes).toContain('mage');
    expect(classes).toContain('rogue');
  });
});

describe('TileType', () => {
  it('accepts all valid tile types', () => {
    const types: TileType[] = ['grass', 'path', 'rock', 'water'];
    expect(types).toHaveLength(4);
  });
});

describe('EventType', () => {
  it('accepts all valid event types', () => {
    const types: EventType[] = ['campfire', 'blacksmith', 'small_monster', 'rare_monster', 'random'];
    expect(types).toHaveLength(5);
  });
});

describe('GamePhase', () => {
  it('accepts all valid game phases', () => {
    const phases: GamePhase[] = ['lobby', 'countdown', 'playing', 'finished'];
    expect(phases).toHaveLength(4);
  });
});

describe('CombatType', () => {
  it('accepts all valid combat types', () => {
    const types: CombatType[] = ['pve', 'pvp'];
    expect(types).toHaveLength(2);
  });
});

describe('CardType', () => {
  it('accepts all valid card types', () => {
    const types: CardType[] = ['attack', 'skill', 'power'];
    expect(types).toHaveLength(3);
  });
});

describe('Position', () => {
  it('creates a valid position', () => {
    const pos: Position = { x: 10, y: 20 };
    expect(pos.x).toBe(10);
    expect(pos.y).toBe(20);
  });
});

describe('PlayerStats', () => {
  it('creates valid player stats', () => {
    const stats: PlayerStats = {
      damageDealt: 0,
      cardsPlayed: 0,
      monstersKilled: 0,
      eventsClaimed: 0,
    };
    expect(stats.damageDealt).toBe(0);
    expect(stats.cardsPlayed).toBe(0);
    expect(stats.monstersKilled).toBe(0);
    expect(stats.eventsClaimed).toBe(0);
  });
});

describe('Player', () => {
  it('creates a valid warrior player', () => {
    const player: Player = {
      id: 'player-1',
      name: 'Aldric',
      class: 'warrior',
      hp: 100,
      maxHp: 100,
      position: { x: 30, y: 30 },
      deck: ['strike', 'defend'],
      hand: [],
      drawPile: ['strike', 'defend'],
      discardPile: [],
      block: 0,
      isAlive: true,
      freeNonFightEvents: 3,
      needsFight: false,
      pvpCooldowns: {},
      stats: {
        damageDealt: 0,
        cardsPlayed: 0,
        monstersKilled: 0,
        eventsClaimed: 0,
      },
    };

    expect(player.id).toBe('player-1');
    expect(player.class).toBe('warrior');
    expect(player.hp).toBe(100);
    expect(player.isAlive).toBe(true);
    expect(player.freeNonFightEvents).toBe(3);
    expect(player.needsFight).toBe(false);
    expect(player.pvpCooldowns).toEqual({});
  });

  it('creates a valid mage player', () => {
    const player: Player = {
      id: 'player-2',
      name: 'Sylara',
      class: 'mage',
      hp: 80,
      maxHp: 100,
      position: { x: 5, y: 10 },
      deck: ['fireball'],
      hand: ['fireball'],
      drawPile: [],
      discardPile: [],
      block: 5,
      isAlive: true,
      freeNonFightEvents: 0,
      needsFight: true,
      pvpCooldowns: { 'player-1': 10 },
      stats: {
        damageDealt: 50,
        cardsPlayed: 3,
        monstersKilled: 1,
        eventsClaimed: 2,
      },
    };

    expect(player.class).toBe('mage');
    expect(player.pvpCooldowns['player-1']).toBe(10);
    expect(player.stats.damageDealt).toBe(50);
  });

  it('creates a valid rogue player', () => {
    const player: Player = {
      id: 'player-3',
      name: 'Vex',
      class: 'rogue',
      hp: 70,
      maxHp: 100,
      position: { x: 15, y: 25 },
      deck: [],
      hand: [],
      drawPile: [],
      discardPile: [],
      block: 0,
      isAlive: false,
      freeNonFightEvents: 1,
      needsFight: false,
      pvpCooldowns: {},
      stats: {
        damageDealt: 120,
        cardsPlayed: 10,
        monstersKilled: 3,
        eventsClaimed: 5,
      },
    };

    expect(player.class).toBe('rogue');
    expect(player.isAlive).toBe(false);
  });
});

describe('Tile', () => {
  it('creates valid tiles', () => {
    const grassTile: Tile = { type: 'grass', walkable: true };
    const rockTile: Tile = { type: 'rock', walkable: false };
    const waterTile: Tile = { type: 'water', walkable: false };
    const pathTile: Tile = { type: 'path', walkable: true };

    expect(grassTile.walkable).toBe(true);
    expect(rockTile.walkable).toBe(false);
    expect(waterTile.type).toBe('water');
    expect(pathTile.type).toBe('path');
  });
});

describe('GameMap', () => {
  it('creates a valid game map', () => {
    const map: GameMap = {
      width: 60,
      height: 60,
      tiles: [[{ type: 'grass', walkable: true }]],
    };

    expect(map.width).toBe(60);
    expect(map.height).toBe(60);
    expect(map.tiles[0][0].type).toBe('grass');
  });
});

describe('EventTile', () => {
  it('creates a valid event tile', () => {
    const event: EventTile = {
      id: 'event-1',
      type: 'campfire',
      position: { x: 10, y: 15 },
      active: true,
    };

    expect(event.id).toBe('event-1');
    expect(event.type).toBe('campfire');
    expect(event.active).toBe(true);
  });
});

describe('ZoneBoundary', () => {
  it('creates a valid zone boundary', () => {
    const zone: ZoneBoundary = { minX: 0, minY: 0, maxX: 60, maxY: 60 };
    expect(zone.minX).toBe(0);
    expect(zone.maxX).toBe(60);
  });
});

describe('MonsterState', () => {
  it('creates a valid monster state', () => {
    const monster: MonsterState = {
      id: 'monster-1',
      name: 'Goblin',
      hp: 30,
      maxHp: 30,
      block: 0,
      patternIndex: 0,
      buffs: {},
    };

    expect(monster.name).toBe('Goblin');
    expect(monster.hp).toBe(30);
    expect(monster.buffs).toEqual({});
  });

  it('creates a monster with buffs', () => {
    const monster: MonsterState = {
      id: 'monster-2',
      name: 'Troll',
      hp: 70,
      maxHp: 80,
      block: 5,
      patternIndex: 2,
      buffs: { strength: 2, vulnerable: 1 },
    };

    expect(monster.buffs['strength']).toBe(2);
    expect(monster.patternIndex).toBe(2);
  });
});

describe('CombatState', () => {
  it('creates a valid PvE combat state', () => {
    const combat: CombatState = {
      id: 'combat-1',
      type: 'pve',
      playerIds: ['player-1'],
      activePlayerIndex: 0,
      turnCounters: { 'player-1': 0 },
      round: 1,
      maxRounds: 4,
      damageTracker: {},
      damageCap: 20,
      monster: {
        id: 'monster-1',
        name: 'Goblin',
        hp: 30,
        maxHp: 30,
        block: 0,
        patternIndex: 0,
        buffs: {},
      },
      turnTimer: 30,
      isComplete: false,
    };

    expect(combat.type).toBe('pve');
    expect(combat.monster).toBeDefined();
    expect(combat.monster!.name).toBe('Goblin');
    expect(combat.isComplete).toBe(false);
  });

  it('creates a valid PvP combat state without monster', () => {
    const combat: CombatState = {
      id: 'combat-2',
      type: 'pvp',
      playerIds: ['player-1', 'player-2'],
      activePlayerIndex: 0,
      turnCounters: { 'player-1': 0, 'player-2': 0 },
      round: 1,
      maxRounds: 4,
      damageTracker: { 'player-1': 0, 'player-2': 0 },
      damageCap: 20,
      turnTimer: 30,
      isComplete: false,
    };

    expect(combat.type).toBe('pvp');
    expect(combat.monster).toBeUndefined();
    expect(combat.playerIds).toHaveLength(2);
  });
});

describe('GameState', () => {
  it('creates a valid game state', () => {
    const state: GameState = {
      id: 'game-1',
      phase: 'lobby',
      players: {},
      map: {
        width: 60,
        height: 60,
        tiles: [],
      },
      events: [],
      elapsed: 0,
      zonePhase: 0,
      zoneBoundary: { minX: 0, minY: 0, maxX: 60, maxY: 60 },
      combats: {},
    };

    expect(state.id).toBe('game-1');
    expect(state.phase).toBe('lobby');
    expect(state.players).toEqual({});
    expect(state.elapsed).toBe(0);
  });

  it('creates a playing game state with players', () => {
    const player: Player = {
      id: 'p1',
      name: 'Hero',
      class: 'warrior',
      hp: 100,
      maxHp: 100,
      position: { x: 30, y: 30 },
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
    };

    const state: GameState = {
      id: 'game-2',
      phase: 'playing',
      players: { 'p1': player },
      map: { width: 60, height: 60, tiles: [] },
      events: [{ id: 'e1', type: 'campfire', position: { x: 20, y: 20 }, active: true }],
      elapsed: 120,
      zonePhase: 1,
      zoneBoundary: { minX: 5, minY: 5, maxX: 55, maxY: 55 },
      combats: {},
    };

    expect(state.phase).toBe('playing');
    expect(state.players['p1'].name).toBe('Hero');
    expect(state.events).toHaveLength(1);
    expect(state.elapsed).toBe(120);
    expect(state.zonePhase).toBe(1);
  });
});
