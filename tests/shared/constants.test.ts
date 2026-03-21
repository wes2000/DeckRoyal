import { describe, it, expect } from 'vitest';
import {
  STARTING_HP,
  MAX_HP_CAP,
  STARTING_ENERGY,
  ENERGY_PER_TURN,
  CARDS_PER_DRAW,
  TURN_TIMER_SECONDS,
  PVP_DAMAGE_CAP,
  PVP_MAX_ROUNDS,
  PVP_COOLDOWN_SECONDS,
  FLEE_HP_COST,
  FREE_NON_FIGHT_EVENTS,
  MAP_WIDTH,
  MAP_HEIGHT,
  MOVEMENT_SPEED,
  ZONE_DAMAGE_PER_SECOND,
  SUDDEN_DEATH_DAMAGE_PER_SECOND,
  ZONE_PHASES,
  EVENT_DISTRIBUTION_8_PLAYERS,
  MONSTER_HP_RANGES,
  CAMPFIRE_HEAL_RANGE,
  getEventCountForPlayers,
  getEventDistributionForPlayers,
} from '@shared/constants';

describe('Core player constants', () => {
  it('has correct starting HP', () => {
    expect(STARTING_HP).toBe(100);
  });

  it('has correct max HP cap', () => {
    expect(MAX_HP_CAP).toBe(120);
  });

  it('has correct starting energy', () => {
    expect(STARTING_ENERGY).toBe(2);
  });

  it('has correct energy per turn', () => {
    expect(ENERGY_PER_TURN).toBe(1);
  });

  it('has correct cards per draw', () => {
    expect(CARDS_PER_DRAW).toBe(5);
  });

  it('has correct turn timer', () => {
    expect(TURN_TIMER_SECONDS).toBe(30);
  });
});

describe('PvP constants', () => {
  it('has correct PvP damage cap', () => {
    expect(PVP_DAMAGE_CAP).toBe(20);
  });

  it('has correct PvP max rounds', () => {
    expect(PVP_MAX_ROUNDS).toBe(4);
  });

  it('has correct PvP cooldown seconds', () => {
    expect(PVP_COOLDOWN_SECONDS).toBe(10);
  });
});

describe('Flee and event constants', () => {
  it('has correct flee HP cost', () => {
    expect(FLEE_HP_COST).toBe(10);
  });

  it('has correct free non-fight events', () => {
    expect(FREE_NON_FIGHT_EVENTS).toBe(3);
  });
});

describe('Map constants', () => {
  it('has correct map width', () => {
    expect(MAP_WIDTH).toBe(60);
  });

  it('has correct map height', () => {
    expect(MAP_HEIGHT).toBe(60);
  });

  it('has correct movement speed', () => {
    expect(MOVEMENT_SPEED).toBe(5);
  });
});

describe('Zone damage constants', () => {
  it('has correct zone damage per second', () => {
    expect(ZONE_DAMAGE_PER_SECOND).toBe(5);
  });

  it('has correct sudden death damage per second', () => {
    expect(SUDDEN_DEATH_DAMAGE_PER_SECOND).toBe(2);
  });
});

describe('Zone phases', () => {
  it('has 6 zone phases', () => {
    expect(ZONE_PHASES).toHaveLength(6);
  });

  it('phase 0 is full map at 0:00', () => {
    expect(ZONE_PHASES[0].phase).toBe(0);
    expect(ZONE_PHASES[0].timeSeconds).toBe(0);
    expect(ZONE_PHASES[0].zonePercent).toBe(100);
  });

  it('phase 1 shrinks to 75% at 5:30', () => {
    expect(ZONE_PHASES[1].phase).toBe(1);
    expect(ZONE_PHASES[1].timeSeconds).toBe(330);
    expect(ZONE_PHASES[1].zonePercent).toBe(75);
  });

  it('phase 2 shrinks to 50% at 9:00', () => {
    expect(ZONE_PHASES[2].phase).toBe(2);
    expect(ZONE_PHASES[2].timeSeconds).toBe(540);
    expect(ZONE_PHASES[2].zonePercent).toBe(50);
  });

  it('phase 3 shrinks to 25% at 12:00', () => {
    expect(ZONE_PHASES[3].phase).toBe(3);
    expect(ZONE_PHASES[3].timeSeconds).toBe(720);
    expect(ZONE_PHASES[3].zonePercent).toBe(25);
  });

  it('phase 4 shrinks to 15% at 15:00', () => {
    expect(ZONE_PHASES[4].phase).toBe(4);
    expect(ZONE_PHASES[4].timeSeconds).toBe(900);
    expect(ZONE_PHASES[4].zonePercent).toBe(15);
  });

  it('phase 5 is sudden death at 5% at 18:00', () => {
    expect(ZONE_PHASES[5].phase).toBe(5);
    expect(ZONE_PHASES[5].timeSeconds).toBe(1080);
    expect(ZONE_PHASES[5].zonePercent).toBe(5);
    expect(ZONE_PHASES[5].suddenDeath).toBe(true);
  });
});

describe('Event distribution for 8 players', () => {
  it('has correct event counts per type', () => {
    expect(EVENT_DISTRIBUTION_8_PLAYERS.campfire).toBe(6);
    expect(EVENT_DISTRIBUTION_8_PLAYERS.blacksmith).toBe(4);
    expect(EVENT_DISTRIBUTION_8_PLAYERS.small_monster).toBe(10);
    expect(EVENT_DISTRIBUTION_8_PLAYERS.rare_monster).toBe(4);
    expect(EVENT_DISTRIBUTION_8_PLAYERS.random).toBe(6);
  });

  it('totals 30 events for 8 players', () => {
    const total = Object.values(EVENT_DISTRIBUTION_8_PLAYERS).reduce((a, b) => a + b, 0);
    expect(total).toBe(30);
  });
});

describe('getEventCountForPlayers', () => {
  it('returns 8 events for 1 player', () => {
    expect(getEventCountForPlayers(1)).toBe(8);
  });

  it('returns 11 events for 2 players', () => {
    expect(getEventCountForPlayers(2)).toBe(11);
  });

  it('returns 14 events for 3 players', () => {
    expect(getEventCountForPlayers(3)).toBe(14);
  });

  it('returns 18 events for 4 players', () => {
    expect(getEventCountForPlayers(4)).toBe(18);
  });

  it('returns 21 events for 5 players', () => {
    expect(getEventCountForPlayers(5)).toBe(21);
  });

  it('returns 24 events for 6 players', () => {
    expect(getEventCountForPlayers(6)).toBe(24);
  });

  it('returns 27 events for 7 players', () => {
    expect(getEventCountForPlayers(7)).toBe(27);
  });

  it('returns 30 events for 8 players', () => {
    expect(getEventCountForPlayers(8)).toBe(30);
  });

  it('matches the authoritative lookup table for all player counts', () => {
    // The spec provides these exact values as the source of truth.
    // Note: the formula "round(n * 3.75)" in the spec is inaccurate for n < 8;
    // the lookup table takes precedence.
    const lookup: Record<number, number> = {
      1: 8, 2: 11, 3: 14, 4: 18, 5: 21, 6: 24, 7: 27, 8: 30,
    };
    for (let n = 1; n <= 8; n++) {
      expect(getEventCountForPlayers(n)).toBe(lookup[n]);
    }
  });
});

describe('getEventDistributionForPlayers', () => {
  it('returns correct distribution for 8 players', () => {
    const dist = getEventDistributionForPlayers(8);
    expect(dist.campfire).toBe(6);
    expect(dist.blacksmith).toBe(4);
    expect(dist.small_monster).toBe(10);
    expect(dist.rare_monster).toBe(4);
    expect(dist.random).toBe(6);
  });

  it('total matches getEventCountForPlayers for all player counts', () => {
    for (let n = 1; n <= 8; n++) {
      const dist = getEventDistributionForPlayers(n);
      const total = Object.values(dist).reduce((a, b) => a + b, 0);
      expect(total).toBe(getEventCountForPlayers(n));
    }
  });

  it('returns only non-negative counts', () => {
    for (let n = 1; n <= 8; n++) {
      const dist = getEventDistributionForPlayers(n);
      for (const count of Object.values(dist)) {
        expect(count).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('all event types are present in the distribution', () => {
    const dist = getEventDistributionForPlayers(4);
    expect(dist).toHaveProperty('campfire');
    expect(dist).toHaveProperty('blacksmith');
    expect(dist).toHaveProperty('small_monster');
    expect(dist).toHaveProperty('rare_monster');
    expect(dist).toHaveProperty('random');
  });
});

describe('Monster HP ranges', () => {
  it('small monster HP range is 30-45', () => {
    expect(MONSTER_HP_RANGES.small.min).toBe(30);
    expect(MONSTER_HP_RANGES.small.max).toBe(45);
  });

  it('rare monster HP range is 60-80', () => {
    expect(MONSTER_HP_RANGES.rare.min).toBe(60);
    expect(MONSTER_HP_RANGES.rare.max).toBe(80);
  });
});

describe('Campfire heal range', () => {
  it('campfire heal range is 25-30', () => {
    expect(CAMPFIRE_HEAL_RANGE.min).toBe(25);
    expect(CAMPFIRE_HEAL_RANGE.max).toBe(30);
  });
});
