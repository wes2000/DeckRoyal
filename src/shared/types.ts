export type PlayerClass = 'warrior' | 'mage' | 'rogue';
export type TileType = 'grass' | 'path' | 'rock' | 'water';
export type EventType = 'campfire' | 'blacksmith' | 'small_monster' | 'rare_monster' | 'random';
export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'finished';
export type CombatType = 'pve' | 'pvp';
export type CardType = 'attack' | 'skill' | 'power';

export interface Position { x: number; y: number; }

export interface PlayerStats {
  damageDealt: number;
  cardsPlayed: number;
  monstersKilled: number;
  eventsClaimed: number;
}

export interface Player {
  id: string;
  name: string;
  class: PlayerClass;
  hp: number;
  maxHp: number;
  position: Position;
  deck: string[];
  hand: string[];
  drawPile: string[];
  discardPile: string[];
  block: number;
  isAlive: boolean;
  freeNonFightEvents: number;
  needsFight: boolean;
  pvpCooldowns: Record<string, number>;
  stats: PlayerStats;
}

export interface Tile { type: TileType; walkable: boolean; }

export interface GameMap { width: number; height: number; tiles: Tile[][]; }

export interface EventTile {
  id: string;
  type: EventType;
  position: Position;
  active: boolean;
}

export interface ZoneBoundary { minX: number; minY: number; maxX: number; maxY: number; }

export interface MonsterState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  patternIndex: number;
  buffs: Record<string, number>;
}

export interface CombatState {
  id: string;
  type: CombatType;
  playerIds: string[];
  activePlayerIndex: number;
  turnCounters: Record<string, number>;
  round: number;
  maxRounds: number;
  damageTracker: Record<string, number>;
  damageCap: number;
  monster?: MonsterState;
  turnTimer: number;
  isComplete: boolean;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: Record<string, Player>;
  map: GameMap;
  events: EventTile[];
  elapsed: number;
  zonePhase: number;
  zoneBoundary: ZoneBoundary;
  combats: Record<string, CombatState>;
}
