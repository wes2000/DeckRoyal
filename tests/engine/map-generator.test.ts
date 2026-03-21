import { describe, it, expect } from 'vitest';
import { generateMap, placeEvents, getSpawnPoints } from '@engine/map-generator';
import { getEventCountForPlayers, getEventDistributionForPlayers } from '@shared/constants';
import type { EventType } from '@shared/types';

// ---------------------------------------------------------------------------
// generateMap
// ---------------------------------------------------------------------------

describe('generateMap', () => {
  it('returns a GameMap with correct dimensions', () => {
    const map = generateMap(60, 60);
    expect(map.width).toBe(60);
    expect(map.height).toBe(60);
    expect(map.tiles).toHaveLength(60);
    for (const row of map.tiles) {
      expect(row).toHaveLength(60);
    }
  });

  it('every tile has a type and walkable boolean', () => {
    const map = generateMap(20, 20);
    const validTypes = new Set(['grass', 'path', 'rock', 'water']);
    for (const row of map.tiles) {
      for (const tile of row) {
        expect(validTypes.has(tile.type)).toBe(true);
        expect(typeof tile.walkable).toBe('boolean');
      }
    }
  });

  it('has both walkable and impassable tiles', () => {
    const map = generateMap(60, 60);
    let walkableCount = 0;
    let impassableCount = 0;
    for (const row of map.tiles) {
      for (const tile of row) {
        if (tile.walkable) walkableCount++;
        else impassableCount++;
      }
    }
    expect(walkableCount).toBeGreaterThan(0);
    expect(impassableCount).toBeGreaterThan(0);
  });

  it('impassable tiles do not block all movement (majority of tiles are walkable)', () => {
    const map = generateMap(60, 60);
    let walkableCount = 0;
    const total = map.width * map.height;
    for (const row of map.tiles) {
      for (const tile of row) {
        if (tile.walkable) walkableCount++;
      }
    }
    // At least 50% of tiles should be walkable so movement is not blocked
    expect(walkableCount / total).toBeGreaterThan(0.5);
  });

  it('all walkable tiles form a single connected component', () => {
    const map = generateMap(60, 60, 42);

    // Find first walkable tile
    let startX = -1;
    let startY = -1;
    outer:
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x].walkable) {
          startX = x;
          startY = y;
          break outer;
        }
      }
    }
    expect(startX).toBeGreaterThanOrEqual(0);

    // BFS flood fill
    const visited = new Set<string>();
    const queue: [number, number][] = [[startX, startY]];
    visited.add(`${startX},${startY}`);
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    let head = 0;

    while (head < queue.length) {
      const [cx, cy] = queue[head++];
      for (const [dx, dy] of dirs) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
        const key = `${nx},${ny}`;
        if (!visited.has(key) && map.tiles[ny][nx].walkable) {
          visited.add(key);
          queue.push([nx, ny]);
        }
      }
    }

    // All walkable tiles must be reachable
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        if (map.tiles[y][x].walkable) {
          expect(visited.has(`${x},${y}`)).toBe(true);
        }
      }
    }
  });

  it('is deterministic with the same seed', () => {
    const map1 = generateMap(60, 60, 123);
    const map2 = generateMap(60, 60, 123);
    expect(map1.tiles).toEqual(map2.tiles);
  });

  it('produces different maps with different seeds', () => {
    const map1 = generateMap(60, 60, 1);
    const map2 = generateMap(60, 60, 2);
    // At least some tiles should differ
    let differs = false;
    outer:
    for (let y = 0; y < map1.height; y++) {
      for (let x = 0; x < map1.width; x++) {
        if (map1.tiles[y][x].type !== map2.tiles[y][x].type) {
          differs = true;
          break outer;
        }
      }
    }
    expect(differs).toBe(true);
  });

  it('grass and path tiles are walkable; rock and water are not', () => {
    const map = generateMap(60, 60, 7);
    for (const row of map.tiles) {
      for (const tile of row) {
        if (tile.type === 'grass' || tile.type === 'path') {
          expect(tile.walkable).toBe(true);
        } else {
          expect(tile.walkable).toBe(false);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// placeEvents
// ---------------------------------------------------------------------------

describe('placeEvents', () => {
  it('places the correct total number of events for each player count', () => {
    for (let n = 1; n <= 8; n++) {
      const map = generateMap(60, 60, n);
      const events = placeEvents(map, n);
      expect(events).toHaveLength(getEventCountForPlayers(n));
    }
  });

  it('respects distribution per event type', () => {
    for (let n = 1; n <= 8; n++) {
      const map = generateMap(60, 60, n * 10);
      const events = placeEvents(map, n);
      const dist = getEventDistributionForPlayers(n);

      const counts: Record<string, number> = {};
      for (const ev of events) {
        counts[ev.type] = (counts[ev.type] ?? 0) + 1;
      }

      for (const [type, expected] of Object.entries(dist)) {
        expect(counts[type] ?? 0).toBe(expected);
      }
    }
  });

  it('places events only on walkable tiles', () => {
    const map = generateMap(60, 60, 99);
    const events = placeEvents(map, 4);
    for (const ev of events) {
      const tile = map.tiles[ev.position.y][ev.position.x];
      expect(tile.walkable).toBe(true);
    }
  });

  it('events have unique positions', () => {
    const map = generateMap(60, 60, 55);
    const events = placeEvents(map, 8);
    const positions = new Set(events.map(ev => `${ev.position.x},${ev.position.y}`));
    expect(positions.size).toBe(events.length);
  });

  it('events are spread: minimum 3-tile Manhattan distance between any two', () => {
    const map = generateMap(60, 60, 77);
    const events = placeEvents(map, 8);
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const dx = Math.abs(events[i].position.x - events[j].position.x);
        const dy = Math.abs(events[i].position.y - events[j].position.y);
        const dist = dx + dy;
        expect(dist).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('events are spread across the map (no more than 40% in any quadrant)', () => {
    const map = generateMap(60, 60, 33);
    const events = placeEvents(map, 8);
    const halfW = map.width / 2;
    const halfH = map.height / 2;

    const quadrants = [0, 0, 0, 0]; // TL, TR, BL, BR
    for (const ev of events) {
      const qx = ev.position.x < halfW ? 0 : 1;
      const qy = ev.position.y < halfH ? 0 : 1;
      quadrants[qy * 2 + qx]++;
    }

    const maxAllowed = Math.ceil(events.length * 0.4);
    for (const count of quadrants) {
      expect(count).toBeLessThanOrEqual(maxAllowed);
    }
  });

  it('each event has a unique id, valid type, and active=true', () => {
    const map = generateMap(60, 60, 11);
    const events = placeEvents(map, 4);
    const validTypes: EventType[] = ['campfire', 'blacksmith', 'small_monster', 'rare_monster', 'random'];
    const ids = new Set<string>();

    for (const ev of events) {
      expect(validTypes).toContain(ev.type);
      expect(ev.active).toBe(true);
      expect(typeof ev.id).toBe('string');
      expect(ev.id.length).toBeGreaterThan(0);
      ids.add(ev.id);
    }

    expect(ids.size).toBe(events.length);
  });
});

// ---------------------------------------------------------------------------
// getSpawnPoints
// ---------------------------------------------------------------------------

describe('getSpawnPoints', () => {
  it('returns the correct number of spawn points for each player count', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 8);
    for (let n = 1; n <= 8; n++) {
      const spawns = getSpawnPoints(map, n, events);
      expect(spawns).toHaveLength(n);
    }
  });

  it('spawn points are within map bounds', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 4);
    const spawns = getSpawnPoints(map, 4, events);
    for (const sp of spawns) {
      expect(sp.x).toBeGreaterThanOrEqual(0);
      expect(sp.x).toBeLessThan(map.width);
      expect(sp.y).toBeGreaterThanOrEqual(0);
      expect(sp.y).toBeLessThan(map.height);
    }
  });

  it('spawn points land on walkable tiles', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 4);
    const spawns = getSpawnPoints(map, 4, events);
    for (const sp of spawns) {
      expect(map.tiles[sp.y][sp.x].walkable).toBe(true);
    }
  });

  it('spawn points are near map edges (within 10 tiles)', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 8);
    const spawns = getSpawnPoints(map, 8, events);
    const edgeThreshold = 10;
    for (const sp of spawns) {
      const nearEdge =
        sp.x < edgeThreshold ||
        sp.x >= map.width - edgeThreshold ||
        sp.y < edgeThreshold ||
        sp.y >= map.height - edgeThreshold;
      expect(nearEdge).toBe(true);
    }
  });

  it('spawn points are maximally distant: each pair has at least 10-tile Chebyshev distance for 4 players', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 4);
    const spawns = getSpawnPoints(map, 4, events);
    for (let i = 0; i < spawns.length; i++) {
      for (let j = i + 1; j < spawns.length; j++) {
        const chebyshev = Math.max(
          Math.abs(spawns[i].x - spawns[j].x),
          Math.abs(spawns[i].y - spawns[j].y),
        );
        expect(chebyshev).toBeGreaterThanOrEqual(10);
      }
    }
  });

  it('each spawn has 2-3 events within a 5-tile Manhattan radius', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 4);
    const spawns = getSpawnPoints(map, 4, events);
    for (const sp of spawns) {
      const nearby = events.filter(ev => {
        const dx = Math.abs(ev.position.x - sp.x);
        const dy = Math.abs(ev.position.y - sp.y);
        return dx + dy <= 5;
      });
      expect(nearby.length).toBeGreaterThanOrEqual(2);
      expect(nearby.length).toBeLessThanOrEqual(3);
    }
  });

  it('spawn points have unique positions', () => {
    const map = generateMap(60, 60, 64);
    const events = placeEvents(map, 8);
    const spawns = getSpawnPoints(map, 8, events);
    const positions = new Set(spawns.map(sp => `${sp.x},${sp.y}`));
    expect(positions.size).toBe(spawns.length);
  });
});
