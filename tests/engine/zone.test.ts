import { describe, it, expect } from 'vitest';
import {
  getZonePhase,
  getZoneBoundary,
  isInsideZone,
  getZoneDamage,
  destroyEventsOutsideZone,
  getNearestSafePosition,
  isZoneWarning,
} from '@engine/zone';
import type { Position, ZoneBoundary, EventTile } from '@shared/types';
import { MAP_WIDTH, MAP_HEIGHT, ZONE_DAMAGE_PER_SECOND, SUDDEN_DEATH_DAMAGE_PER_SECOND } from '@shared/constants';

// ---------------------------------------------------------------------------
// getZonePhase
// ---------------------------------------------------------------------------

describe('getZonePhase', () => {
  it('returns phase 0 at t=0', () => {
    expect(getZonePhase(0)).toBe(0);
  });

  it('returns phase 0 just before phase 1 (t=329)', () => {
    expect(getZonePhase(329)).toBe(0);
  });

  it('returns phase 1 at exactly t=330', () => {
    expect(getZonePhase(330)).toBe(1);
  });

  it('returns phase 1 between 330 and 539', () => {
    expect(getZonePhase(400)).toBe(1);
    expect(getZonePhase(539)).toBe(1);
  });

  it('returns phase 2 at exactly t=540', () => {
    expect(getZonePhase(540)).toBe(2);
  });

  it('returns phase 3 at exactly t=720', () => {
    expect(getZonePhase(720)).toBe(3);
  });

  it('returns phase 4 at exactly t=900', () => {
    expect(getZonePhase(900)).toBe(4);
  });

  it('returns phase 5 at exactly t=1080', () => {
    expect(getZonePhase(1080)).toBe(5);
  });

  it('returns phase 5 well past sudden death (t=9999)', () => {
    expect(getZonePhase(9999)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getZoneBoundary
// ---------------------------------------------------------------------------

describe('getZoneBoundary', () => {
  it('phase 0 covers full 60x60 map: minX=0, minY=0, maxX=59, maxY=59', () => {
    const b = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, 0);
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(59);
    expect(b.maxY).toBe(59);
  });

  it('phase 5 (sudden death, 5%) covers ~5% of the map — shrunk to center', () => {
    const b = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, 5);
    // Side at 5%: sqrt(0.05) * 60 ≈ 13.4 tiles
    // Width and height must be significantly less than 60
    const width = b.maxX - b.minX + 1;
    const height = b.maxY - b.minY + 1;
    // Should be roughly 13-14 tiles on each side
    expect(width).toBeGreaterThanOrEqual(12);
    expect(width).toBeLessThanOrEqual(15);
    expect(height).toBeGreaterThanOrEqual(12);
    expect(height).toBeLessThanOrEqual(15);
    // Must be centered: minX and maxX should be symmetric-ish around 29.5
    expect(b.minX).toBeGreaterThan(0);
    expect(b.maxX).toBeLessThan(59);
    expect(b.minY).toBeGreaterThan(0);
    expect(b.maxY).toBeLessThan(59);
  });

  it('phase 2 (50%) boundary is smaller than phase 1 (75%)', () => {
    const b1 = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, 1);
    const b2 = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, 2);
    const area1 = (b1.maxX - b1.minX + 1) * (b1.maxY - b1.minY + 1);
    const area2 = (b2.maxX - b2.minX + 1) * (b2.maxY - b2.minY + 1);
    expect(area2).toBeLessThan(area1);
  });

  it('each successive phase boundary shrinks or stays same', () => {
    let prevArea = Infinity;
    for (let phase = 0; phase <= 5; phase++) {
      const b = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, phase);
      const area = (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1);
      expect(area).toBeLessThanOrEqual(prevArea);
      prevArea = area;
    }
  });

  it('boundary is always within map bounds', () => {
    for (let phase = 0; phase <= 5; phase++) {
      const b = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, phase);
      expect(b.minX).toBeGreaterThanOrEqual(0);
      expect(b.minY).toBeGreaterThanOrEqual(0);
      expect(b.maxX).toBeLessThanOrEqual(MAP_WIDTH - 1);
      expect(b.maxY).toBeLessThanOrEqual(MAP_HEIGHT - 1);
    }
  });

  it('invalid phase (negative) returns full map', () => {
    const b = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, -1);
    expect(b.minX).toBe(0);
    expect(b.minY).toBe(0);
    expect(b.maxX).toBe(MAP_WIDTH - 1);
    expect(b.maxY).toBe(MAP_HEIGHT - 1);
  });
});

// ---------------------------------------------------------------------------
// isInsideZone
// ---------------------------------------------------------------------------

describe('isInsideZone', () => {
  const boundary: ZoneBoundary = { minX: 10, minY: 10, maxX: 50, maxY: 50 };

  it('returns true for position clearly inside zone', () => {
    expect(isInsideZone({ x: 30, y: 30 }, boundary)).toBe(true);
  });

  it('returns true for position on the boundary edges (inclusive)', () => {
    expect(isInsideZone({ x: 10, y: 10 }, boundary)).toBe(true);
    expect(isInsideZone({ x: 50, y: 50 }, boundary)).toBe(true);
    expect(isInsideZone({ x: 10, y: 50 }, boundary)).toBe(true);
    expect(isInsideZone({ x: 50, y: 10 }, boundary)).toBe(true);
  });

  it('returns false for position outside zone', () => {
    expect(isInsideZone({ x: 9, y: 30 }, boundary)).toBe(false);
    expect(isInsideZone({ x: 51, y: 30 }, boundary)).toBe(false);
    expect(isInsideZone({ x: 30, y: 9 }, boundary)).toBe(false);
    expect(isInsideZone({ x: 30, y: 51 }, boundary)).toBe(false);
  });

  it('returns false for position at map corner when zone is shrunk', () => {
    expect(isInsideZone({ x: 0, y: 0 }, boundary)).toBe(false);
    expect(isInsideZone({ x: 59, y: 59 }, boundary)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getZoneDamage
// ---------------------------------------------------------------------------

describe('getZoneDamage', () => {
  it('returns 0 inside zone during normal phases', () => {
    // Phase 0: t=0
    expect(getZoneDamage(0, true)).toBe(0);
    // Phase 1: t=400
    expect(getZoneDamage(400, true)).toBe(0);
  });

  it('returns ZONE_DAMAGE_PER_SECOND (5) outside zone during normal phases', () => {
    expect(getZoneDamage(0, false)).toBe(ZONE_DAMAGE_PER_SECOND);
    expect(getZoneDamage(400, false)).toBe(ZONE_DAMAGE_PER_SECOND);
    expect(getZoneDamage(900, false)).toBe(ZONE_DAMAGE_PER_SECOND);
    expect(getZoneDamage(1079, false)).toBe(ZONE_DAMAGE_PER_SECOND);
  });

  it('returns SUDDEN_DEATH_DAMAGE_PER_SECOND (2) for everyone during sudden death (t>=1080)', () => {
    // Inside zone — still takes damage
    expect(getZoneDamage(1080, true)).toBe(SUDDEN_DEATH_DAMAGE_PER_SECOND);
    // Outside zone — also takes damage at sudden death rate
    expect(getZoneDamage(1080, false)).toBe(SUDDEN_DEATH_DAMAGE_PER_SECOND);
    expect(getZoneDamage(9999, true)).toBe(SUDDEN_DEATH_DAMAGE_PER_SECOND);
    expect(getZoneDamage(9999, false)).toBe(SUDDEN_DEATH_DAMAGE_PER_SECOND);
  });
});

// ---------------------------------------------------------------------------
// destroyEventsOutsideZone
// ---------------------------------------------------------------------------

describe('destroyEventsOutsideZone', () => {
  const boundary: ZoneBoundary = { minX: 10, minY: 10, maxX: 50, maxY: 50 };

  const events: EventTile[] = [
    { id: 'e1', type: 'campfire', position: { x: 30, y: 30 }, active: true },   // inside
    { id: 'e2', type: 'blacksmith', position: { x: 5, y: 5 }, active: true },   // outside
    { id: 'e3', type: 'small_monster', position: { x: 55, y: 55 }, active: true }, // outside
    { id: 'e4', type: 'rare_monster', position: { x: 10, y: 10 }, active: true }, // on edge — inside
    { id: 'e5', type: 'random', position: { x: 20, y: 20 }, active: false },    // already inactive, outside
  ];

  it('deactivates events outside the zone', () => {
    const result = destroyEventsOutsideZone(events, boundary);
    const e2 = result.find(e => e.id === 'e2')!;
    const e3 = result.find(e => e.id === 'e3')!;
    expect(e2.active).toBe(false);
    expect(e3.active).toBe(false);
  });

  it('keeps events inside zone active', () => {
    const result = destroyEventsOutsideZone(events, boundary);
    const e1 = result.find(e => e.id === 'e1')!;
    const e4 = result.find(e => e.id === 'e4')!;
    expect(e1.active).toBe(true);
    expect(e4.active).toBe(true);
  });

  it('does not mutate original events array', () => {
    const result = destroyEventsOutsideZone(events, boundary);
    // original e2 should still be active
    expect(events[1].active).toBe(true);
    // result is a new array
    expect(result).not.toBe(events);
  });

  it('already-inactive events outside zone remain inactive', () => {
    const result = destroyEventsOutsideZone(events, boundary);
    const e5 = result.find(e => e.id === 'e5')!;
    expect(e5.active).toBe(false);
  });

  it('returns same length array', () => {
    const result = destroyEventsOutsideZone(events, boundary);
    expect(result).toHaveLength(events.length);
  });
});

// ---------------------------------------------------------------------------
// getNearestSafePosition
// ---------------------------------------------------------------------------

describe('getNearestSafePosition', () => {
  const boundary: ZoneBoundary = { minX: 10, minY: 10, maxX: 50, maxY: 50 };

  it('returns same position if already inside zone', () => {
    const pos: Position = { x: 30, y: 30 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(30);
    expect(result.y).toBe(30);
  });

  it('clamps x to minX when too far left', () => {
    const pos: Position = { x: 0, y: 30 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(10);
    expect(result.y).toBe(30);
  });

  it('clamps x to maxX when too far right', () => {
    const pos: Position = { x: 59, y: 30 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(50);
    expect(result.y).toBe(30);
  });

  it('clamps y to minY when too far up', () => {
    const pos: Position = { x: 30, y: 0 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(30);
    expect(result.y).toBe(10);
  });

  it('clamps y to maxY when too far down', () => {
    const pos: Position = { x: 30, y: 59 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(30);
    expect(result.y).toBe(50);
  });

  it('clamps corner position to nearest boundary corner', () => {
    const pos: Position = { x: 0, y: 0 };
    const result = getNearestSafePosition(pos, boundary);
    expect(result.x).toBe(10);
    expect(result.y).toBe(10);
  });

  it('result is always within boundary', () => {
    const testPositions: Position[] = [
      { x: -5, y: -5 },
      { x: 100, y: 100 },
      { x: 0, y: 30 },
      { x: 59, y: 59 },
      { x: 30, y: 0 },
    ];
    for (const pos of testPositions) {
      const result = getNearestSafePosition(pos, boundary);
      expect(result.x).toBeGreaterThanOrEqual(boundary.minX);
      expect(result.x).toBeLessThanOrEqual(boundary.maxX);
      expect(result.y).toBeGreaterThanOrEqual(boundary.minY);
      expect(result.y).toBeLessThanOrEqual(boundary.maxY);
    }
  });

  it('does not mutate the original position', () => {
    const pos: Position = { x: 0, y: 0 };
    getNearestSafePosition(pos, boundary);
    expect(pos.x).toBe(0);
    expect(pos.y).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isZoneWarning
// ---------------------------------------------------------------------------

describe('isZoneWarning', () => {
  it('returns false at t=0 (no upcoming transition within 30 sec — next is at 330)', () => {
    // 330 - 0 = 330, not within 30 sec
    expect(isZoneWarning(0)).toBe(false);
  });

  it('returns true 30 seconds before a phase transition (t=300, next phase at 330)', () => {
    expect(isZoneWarning(300)).toBe(true);
  });

  it('returns true at exactly 30 seconds before transition (t=300)', () => {
    expect(isZoneWarning(300)).toBe(true);
  });

  it('returns false 31 seconds before a transition (t=299)', () => {
    expect(isZoneWarning(299)).toBe(false);
  });

  it('returns true right before phase 2 transition (t=510)', () => {
    // Phase 2 at 540, 540 - 510 = 30
    expect(isZoneWarning(510)).toBe(true);
  });

  it('returns false after the last phase transition (t=1080, no more phases)', () => {
    expect(isZoneWarning(1080)).toBe(false);
  });

  it('returns false well past all phases (t=9999)', () => {
    expect(isZoneWarning(9999)).toBe(false);
  });
});
