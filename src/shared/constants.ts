import type { EventType } from './types';

// Core player constants
export const STARTING_HP = 100;
export const MAX_HP_CAP = 120;
export const STARTING_ENERGY = 2;
export const ENERGY_PER_TURN = 1;
export const CARDS_PER_DRAW = 5;
export const MAX_HAND_SIZE = 5;
export const TURN_TIMER_SECONDS = 30;

// PvP constants
export const PVP_DAMAGE_CAP = 20;
export const PVP_MAX_ROUNDS = 4;
export const PVP_COOLDOWN_SECONDS = 10;

// Flee and event constants
export const FLEE_HP_COST = 10;
export const FREE_NON_FIGHT_EVENTS = 3;

// Map constants
export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 60;
export const MOVEMENT_SPEED = 5;

// Zone damage constants
export const ZONE_DAMAGE_PER_SECOND = 5;
export const SUDDEN_DEATH_DAMAGE_PER_SECOND = 2;
export const ZONE_WARNING_SECONDS = 30;

// Zone phases
// 6 phases: 0:full(100%), 5:30(75%), 9:00(50%), 12:00(25%), 15:00(15%), 18:00(5% sudden death)
export interface ZonePhase {
  phase: number;
  timeSeconds: number;
  zonePercent: number;
  suddenDeath?: boolean;
}

export const ZONE_PHASES: ZonePhase[] = [
  { phase: 0, timeSeconds: 0,    zonePercent: 100 },
  { phase: 1, timeSeconds: 330,  zonePercent: 75 },   // 5:30
  { phase: 2, timeSeconds: 540,  zonePercent: 50 },   // 9:00
  { phase: 3, timeSeconds: 720,  zonePercent: 25 },   // 12:00
  { phase: 4, timeSeconds: 900,  zonePercent: 15 },   // 15:00
  { phase: 5, timeSeconds: 1080, zonePercent: 5, suddenDeath: true }, // 18:00
];

// Event distribution for 8 players (baseline)
export type EventDistribution = Record<EventType, number>;

export const EVENT_DISTRIBUTION_8_PLAYERS: EventDistribution = {
  campfire:      6,
  blacksmith:    4,
  small_monster: 10,
  rare_monster:  4,
  random:        6,
};

// Proportions for each event type (derived from 8-player baseline totaling 30)
const EVENT_TYPE_PROPORTIONS: Record<EventType, number> = {
  campfire:      6 / 30,
  blacksmith:    4 / 30,
  small_monster: 10 / 30,
  rare_monster:  4 / 30,
  random:        6 / 30,
};

const EVENT_TYPE_ORDER: EventType[] = [
  'campfire',
  'blacksmith',
  'small_monster',
  'rare_monster',
  'random',
];

/**
 * Returns the total event count for n players.
 * Authoritative lookup: 1→8, 2→11, 3→14, 4→18, 5→21, 6→24, 7→27, 8→30
 * For counts beyond 8 the pattern continues at +3 or +4 alternating (approx n*3.75).
 */
const EVENT_COUNT_LOOKUP: Record<number, number> = {
  1: 8,
  2: 11,
  3: 14,
  4: 18,
  5: 21,
  6: 24,
  7: 27,
  8: 30,
};

export function getEventCountForPlayers(n: number): number {
  if (n in EVENT_COUNT_LOOKUP) {
    return EVENT_COUNT_LOOKUP[n];
  }
  // Fallback for n outside 1-8
  return Math.round(n * 3.75);
}

/**
 * Returns the event distribution for n players using largest-remainder rounding
 * so that all counts sum exactly to getEventCountForPlayers(n).
 */
export function getEventDistributionForPlayers(n: number): EventDistribution {
  const total = getEventCountForPlayers(n);

  // Compute exact (fractional) counts for each type
  const exact: Record<EventType, number> = {} as Record<EventType, number>;
  for (const type of EVENT_TYPE_ORDER) {
    exact[type] = EVENT_TYPE_PROPORTIONS[type] * total;
  }

  // Floor all values
  const floored: Record<EventType, number> = {} as Record<EventType, number>;
  let flooredSum = 0;
  for (const type of EVENT_TYPE_ORDER) {
    floored[type] = Math.floor(exact[type]);
    flooredSum += floored[type];
  }

  // Distribute remainder using largest-remainder method
  const remainder = total - flooredSum;
  const remainders = EVENT_TYPE_ORDER
    .map((type) => ({ type, frac: exact[type] - floored[type] }))
    .sort((a, b) => b.frac - a.frac);

  const result: EventDistribution = { ...floored };
  for (let i = 0; i < remainder; i++) {
    result[remainders[i].type] += 1;
  }

  return result;
}

// Monster HP ranges
export const MONSTER_HP_RANGES = {
  small: { min: 30, max: 45 },
  rare:  { min: 60, max: 80 },
} as const;

// Campfire heal range
export const CAMPFIRE_HEAL_RANGE = { min: 25, max: 30 } as const;
