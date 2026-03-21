import type { GameMap, Tile, EventTile, Position } from '@shared/types';
import { getEventDistributionForPlayers } from '@shared/constants';

// ---------------------------------------------------------------------------
// Seeded PRNG — mulberry32
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTile(type: Tile['type']): Tile {
  return { type, walkable: type === 'grass' || type === 'path' };
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function manhattanDist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

// ---------------------------------------------------------------------------
// Flood-fill: returns set of all walkable positions reachable from (sx, sy)
// ---------------------------------------------------------------------------

function floodFill(tiles: Tile[][], width: number, height: number, sx: number, sy: number): Set<string> {
  const visited = new Set<string>();
  const queue: [number, number][] = [[sx, sy]];
  visited.add(`${sx},${sy}`);
  const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (!inBounds(nx, ny, width, height)) continue;
      const key = `${nx},${ny}`;
      if (!visited.has(key) && tiles[ny][nx].walkable) {
        visited.add(key);
        queue.push([nx, ny]);
      }
    }
  }
  return visited;
}

// ---------------------------------------------------------------------------
// Core generator
// ---------------------------------------------------------------------------

export function generateMap(width: number, height: number, seed?: number): GameMap {
  const rng = mulberry32(seed ?? Math.floor(Math.random() * 0xffffffff));

  // Attempt generation, retrying if connectivity fails.
  for (let attempt = 0; attempt < 20; attempt++) {
    const attemptSeed = Math.floor(rng() * 0xffffffff);
    const result = tryGenerate(width, height, mulberry32(attemptSeed));
    if (result !== null) return result;
  }

  // Last resort: full grass map (guaranteed connected)
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => makeTile('grass')),
  );
  return { width, height, tiles };
}

function tryGenerate(width: number, height: number, rng: () => number): GameMap | null {
  // Step 1: Fill everything with grass
  const tiles: Tile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => makeTile('grass')),
  );

  // Step 2: Carve random-walk paths
  const numWalks = 6 + Math.floor(rng() * 5); // 6-10 walks
  for (let w = 0; w < numWalks; w++) {
    let x = Math.floor(rng() * width);
    let y = Math.floor(rng() * height);
    const steps = 40 + Math.floor(rng() * 60); // 40-99 steps
    const dirs = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (let s = 0; s < steps; s++) {
      tiles[y][x] = makeTile('path');
      const [dx, dy] = dirs[Math.floor(rng() * 4)];
      const nx = Math.max(0, Math.min(width - 1, x + dx));
      const ny = Math.max(0, Math.min(height - 1, y + dy));
      x = nx;
      y = ny;
    }
  }

  // Step 3: Place rock clusters (~10-15% coverage)
  const numRockClusters = 8 + Math.floor(rng() * 6);
  for (let c = 0; c < numRockClusters; c++) {
    const cx = 2 + Math.floor(rng() * (width - 4));
    const cy = 2 + Math.floor(rng() * (height - 4));
    const radius = 1 + Math.floor(rng() * 3); // 1-3 radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        // Don't overwrite path tiles so paths remain walkable
        if (tiles[ny][nx].type !== 'path') {
          tiles[ny][nx] = makeTile('rock');
        }
      }
    }
  }

  // Step 4: Place water features (~5-10% coverage)
  const numWaterFeatures = 4 + Math.floor(rng() * 4);
  for (let f = 0; f < numWaterFeatures; f++) {
    const cx = 3 + Math.floor(rng() * (width - 6));
    const cy = 3 + Math.floor(rng() * (height - 6));
    const radius = 1 + Math.floor(rng() * 2); // 1-2 radius
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > radius) continue; // diamond shape
        const nx = cx + dx;
        const ny = cy + dy;
        if (!inBounds(nx, ny, width, height)) continue;
        if (tiles[ny][nx].type !== 'path') {
          tiles[ny][nx] = makeTile('water');
        }
      }
    }
  }

  // Step 5: Validate connectivity via flood fill from first walkable tile
  let startX = -1;
  let startY = -1;
  outer:
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].walkable) {
        startX = x;
        startY = y;
        break outer;
      }
    }
  }

  if (startX === -1) return null; // no walkable tiles at all

  const reachable = floodFill(tiles, width, height, startX, startY);

  // Check total walkable count vs reachable count
  let totalWalkable = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].walkable) totalWalkable++;
    }
  }

  if (reachable.size < totalWalkable) {
    // Connectivity broken — connect isolated walkable tiles by carving paths
    // between their first position and the reachable component.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tiles[y][x].walkable && !reachable.has(`${x},${y}`)) {
          // Draw a straight-line corridor to (startX, startY)
          let cx = x;
          let cy = y;
          while (cx !== startX || cy !== startY) {
            tiles[cy][cx] = makeTile('path');
            reachable.add(`${cx},${cy}`);
            if (cx < startX) cx++;
            else if (cx > startX) cx--;
            else if (cy < startY) cy++;
            else cy--;
          }
        }
      }
    }
  }

  // Verify walkability ratio (must be >50%)
  let walkableCount = 0;
  const total = width * height;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (tiles[y][x].walkable) walkableCount++;
    }
  }
  if (walkableCount / total <= 0.5) return null;

  return { width, height, tiles };
}

// ---------------------------------------------------------------------------
// Event placement
// ---------------------------------------------------------------------------

export function placeEvents(map: GameMap, playerCount: number): EventTile[] {
  // Use a deterministic PRNG seeded by map dimensions + playerCount
  // so repeated calls with the same arguments are idempotent.
  // (Pure function: no external randomness.)
  const seed = map.width * 1000 + map.height * 100 + playerCount;
  const rng = mulberry32(seed);

  const distribution = getEventDistributionForPlayers(playerCount);

  // Collect all walkable positions
  const walkable: Position[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.tiles[y][x].walkable) {
        walkable.push({ x, y });
      }
    }
  }

  // Build ordered list of event types to place
  const typesToPlace: Array<EventTile['type']> = [];
  for (const [type, count] of Object.entries(distribution)) {
    for (let i = 0; i < count; i++) {
      typesToPlace.push(type as EventTile['type']);
    }
  }

  const MIN_SPACING = 3;
  const placed: EventTile[] = [];

  // We divide the map into a grid to encourage spread.
  // Place each event type by scanning candidate positions that satisfy
  // min spacing AND come from different regions of the map.
  const gridCols = 4;
  const gridRows = 4;
  const cellW = map.width / gridCols;
  const cellH = map.height / gridRows;

  // Shuffle walkable positions using rng
  const shuffled = shuffleArray([...walkable], rng);

  // Region round-robin: try to pick from a different region for each event
  let regionIndex = 0;
  const totalRegions = gridCols * gridRows;

  for (const type of typesToPlace) {
    let placed_ = false;

    // Try to place in the target region first, then fall back to any valid position
    for (let regionOffset = 0; regionOffset < totalRegions && !placed_; regionOffset++) {
      const targetRegion = (regionIndex + regionOffset) % totalRegions;
      const regionCol = targetRegion % gridCols;
      const regionRow = Math.floor(targetRegion / gridCols);
      const xMin = Math.floor(regionCol * cellW);
      const xMax = Math.floor((regionCol + 1) * cellW);
      const yMin = Math.floor(regionRow * cellH);
      const yMax = Math.floor((regionRow + 1) * cellH);

      for (const pos of shuffled) {
        if (pos.x < xMin || pos.x >= xMax || pos.y < yMin || pos.y >= yMax) continue;
        if (isTooClose(pos, placed, MIN_SPACING)) continue;

        const id = `ev_${type}_${placed.length}_${pos.x}_${pos.y}`;
        placed.push({ id, type, position: pos, active: true });
        placed_ = true;
        break;
      }
    }

    // Last resort: any valid position
    if (!placed_) {
      for (const pos of shuffled) {
        if (isTooClose(pos, placed, MIN_SPACING)) continue;
        const id = `ev_${type}_${placed.length}_${pos.x}_${pos.y}`;
        placed.push({ id, type, position: pos, active: true });
        placed_ = true;
        break;
      }
    }

    regionIndex = (regionIndex + 1) % totalRegions;
  }

  return placed;
}

function isTooClose(pos: Position, placed: EventTile[], minDist: number): boolean {
  for (const ev of placed) {
    if (manhattanDist(pos.x, pos.y, ev.position.x, ev.position.y) < minDist) {
      return true;
    }
  }
  return false;
}

function shuffleArray<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Spawn point generation
// ---------------------------------------------------------------------------

export function getSpawnPoints(map: GameMap, playerCount: number, events: EventTile[]): Position[] {
  // Candidate spawn positions: walkable tiles near map edges (within 8 tiles)
  const EDGE_ZONE = 8;
  const candidates: Position[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (!map.tiles[y][x].walkable) continue;
      const nearEdge =
        x < EDGE_ZONE ||
        x >= map.width - EDGE_ZONE ||
        y < EDGE_ZONE ||
        y >= map.height - EDGE_ZONE;
      if (nearEdge) candidates.push({ x, y });
    }
  }

  // Choose playerCount positions that are maximally spread apart AND
  // each has 2-3 events within a 5-tile Manhattan radius.

  // Filter candidates to those that have 2-3 events within radius 5
  const NEARBY_RADIUS = 5;
  const qualifying = candidates.filter(c => {
    const nearby = events.filter(ev =>
      manhattanDist(c.x, c.y, ev.position.x, ev.position.y) <= NEARBY_RADIUS,
    );
    return nearby.length >= 2 && nearby.length <= 3;
  });

  // Use qualifying if enough, otherwise fall back to all edge candidates
  const pool = qualifying.length >= playerCount ? qualifying : candidates;

  // Greedy farthest-point selection (maximises minimum pairwise Chebyshev distance)
  // Start from a corner-ish position
  const startPos = pool.reduce((best, c) => {
    const score = c.x + c.y; // prefer bottom-right as initial anchor
    const bestScore = best.x + best.y;
    return score < bestScore ? c : best; // actually prefer top-left
  }, pool[0]);

  const chosen: Position[] = [startPos];

  while (chosen.length < playerCount) {
    let bestPos = pool[0];
    let bestMinDist = -1;

    for (const c of pool) {
      // Skip already chosen
      if (chosen.some(s => s.x === c.x && s.y === c.y)) continue;

      // Min Chebyshev distance to any chosen point
      const minDist = Math.min(
        ...chosen.map(s => Math.max(Math.abs(c.x - s.x), Math.abs(c.y - s.y))),
      );

      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestPos = c;
      }
    }

    chosen.push(bestPos);
  }

  return chosen;
}
