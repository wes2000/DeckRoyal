import type { GameState } from '@shared/types';
import { PVP_COOLDOWN_SECONDS, ZONE_DAMAGE_PER_SECOND } from '@shared/constants';
import type { Direction } from './network/messages';

export interface MoveResult {
  game: GameState;
  triggered?: 'event' | 'pvp' | 'pve' | 'bounce';
  eventId?: string;
  combatId?: string;
  lastMoveTime?: number;
}

// Module-level map tracking last move time per player (keyed by playerId).
// Used when callers don't embed it in game state.
const lastMoveTimes = new Map<string, number>();

/**
 * Compute the new grid position for a given direction.
 * up=(x, y-1), down=(x, y+1), left=(x-1, y), right=(x+1, y)
 */
export function getNewPosition(
  x: number,
  y: number,
  direction: Direction,
): { x: number; y: number } {
  switch (direction) {
    case 'up':    return { x, y: y - 1 };
    case 'down':  return { x, y: y + 1 };
    case 'left':  return { x: x - 1, y };
    case 'right': return { x: x + 1, y };
  }
}

/**
 * Returns true if playerId is currently in an incomplete combat.
 */
function isInCombat(game: GameState, playerId: string): boolean {
  return Object.values(game.combats).some(
    (c) => !c.isComplete && c.playerIds.includes(playerId),
  );
}

/**
 * Check whether the target player at `otherId` is currently fighting
 * (i.e., in an incomplete combat at some shared position).
 */
function isPlayerInCombat(game: GameState, otherId: string): boolean {
  return Object.values(game.combats).some(
    (c) => !c.isComplete && c.playerIds.includes(otherId),
  );
}

/**
 * Returns true if the PvP cooldown between `playerId` and `otherId` is still active.
 * Cooldown period = PVP_COOLDOWN_SECONDS * 1000 ms.
 */
export function isOnCooldown(
  game: GameState,
  playerId: string,
  otherId: string,
  currentTime: number,
): boolean {
  const player = game.players[playerId];
  if (!player) return false;
  const cooldownStart = player.pvpCooldowns[otherId];
  if (cooldownStart === undefined) return false;
  return currentTime - cooldownStart < PVP_COOLDOWN_SECONDS * 1000;
}

/**
 * Returns true when the player is allowed to move to (newX, newY).
 *
 * Checks:
 *  1. Map boundary
 *  2. Tile walkability
 *  3. Not in an incomplete combat
 *  4. Movement cooldown (200 ms between moves — 5 tiles/sec)
 *
 * @param lastMoveTime - Optional explicit last-move timestamp. When omitted
 *   the module-level map is consulted. Pass 0 to skip cooldown entirely.
 */
export function canMove(
  game: GameState,
  playerId: string,
  newX: number,
  newY: number,
  currentTime: number,
  lastMoveTime?: number,
): boolean {
  const { map } = game;

  // 1. Boundary check
  if (newX < 0 || newX >= map.width || newY < 0 || newY >= map.height) {
    return false;
  }

  // 2. Tile walkability (tiles[y][x])
  if (!map.tiles[newY][newX].walkable) {
    return false;
  }

  // 3. Combat check
  if (isInCombat(game, playerId)) {
    return false;
  }

  // 4. Movement cooldown (200 ms = 1000 / 5 tiles per sec)
  // lastMoveTime === 0 means "never moved"; lastMoveTime === currentTime means "just bootstrapped"
  // (caller initialises to currentTime before first move). Only enforce cooldown when
  // lastMoveTime is strictly less than currentTime (i.e. a real previous move exists).
  const MOVE_COOLDOWN_MS = 120;
  const lastMove =
    lastMoveTime !== undefined ? lastMoveTime : (lastMoveTimes.get(playerId) ?? 0);
  if (lastMove > 0 && lastMove < currentTime && currentTime - lastMove < MOVE_COOLDOWN_MS) {
    return false;
  }

  return true;
}

/**
 * Attempt to move `playerId` in `direction` at `currentTime`.
 *
 * Returns a MoveResult containing the (possibly updated) GameState and any
 * triggered interaction. The caller should use `result.lastMoveTime` to pass
 * back to subsequent `canMove` / `movePlayer` calls so that cooldown tracking
 * is stateless-friendly.
 *
 * @param lastMoveTime - The timestamp of the player's previous move (0 if none).
 *   Defaults to consulting the module-level cache.
 */
export function movePlayer(
  game: GameState,
  playerId: string,
  direction: Direction,
  currentTime: number,
  lastMoveTime?: number,
): MoveResult {
  const player = game.players[playerId];
  if (!player) return { game };

  const { x, y } = player.position;
  const newPos = getNewPosition(x, y, direction);

  const resolvedLastMove =
    lastMoveTime !== undefined ? lastMoveTime : (lastMoveTimes.get(playerId) ?? 0);

  if (!canMove(game, playerId, newPos.x, newPos.y, currentTime, resolvedLastMove)) {
    // Apply zone damage even when movement is blocked (player is still on map)
    const gameAfterZone = applyZoneDamage(game, playerId, currentTime);
    return { game: gameAfterZone, lastMoveTime: resolvedLastMove };
  }

  // --- Commit the move ---
  lastMoveTimes.set(playerId, currentTime);

  let updatedGame: GameState = {
    ...game,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        position: newPos,
      },
    },
  };

  // --- Apply zone damage ---
  updatedGame = applyZoneDamage(updatedGame, playerId, currentTime);

  // --- Collision / interaction detection ---

  // 1. Check for event tiles at the new position
  const eventTile = updatedGame.events.find(
    (e) => e.active && e.position.x === newPos.x && e.position.y === newPos.y,
  );
  if (eventTile) {
    const triggered =
      eventTile.type === 'small_monster' || eventTile.type === 'rare_monster'
        ? 'pve'
        : 'event';
    return {
      game: updatedGame,
      triggered,
      eventId: eventTile.id,
      lastMoveTime: currentTime,
    };
  }

  // 2. Check for other players at the new position
  const others = Object.values(updatedGame.players).filter(
    (p) => p.id !== playerId && p.isAlive && p.position.x === newPos.x && p.position.y === newPos.y,
  );

  if (others.length > 0) {
    // Check if any of those players are currently fighting
    const anyFighting = others.some((p) => isPlayerInCombat(updatedGame, p.id));

    if (anyFighting) {
      // Bounce: move player to an adjacent walkable tile instead
      const bouncedGame = bouncePlayer(updatedGame, playerId, newPos.x, newPos.y);
      return { game: bouncedGame, triggered: 'bounce', lastMoveTime: currentTime };
    }

    // Check PvP cooldown against any of the players we'd engage
    const target = others[0];
    if (isOnCooldown(updatedGame, playerId, target.id, currentTime)) {
      // Still on cooldown — move but don't engage
      return { game: updatedGame, lastMoveTime: currentTime };
    }

    // Trigger PvP — record cooldowns on both sides and return a combat id placeholder
    const combatId = `pvp-${playerId}-${target.id}-${currentTime}`;
    const pvpGame: GameState = {
      ...updatedGame,
      players: {
        ...updatedGame.players,
        [playerId]: {
          ...updatedGame.players[playerId],
          pvpCooldowns: {
            ...updatedGame.players[playerId].pvpCooldowns,
            [target.id]: currentTime,
          },
        },
        [target.id]: {
          ...updatedGame.players[target.id],
          pvpCooldowns: {
            ...updatedGame.players[target.id].pvpCooldowns,
            [playerId]: currentTime,
          },
        },
      },
    };
    return { game: pvpGame, triggered: 'pvp', combatId, lastMoveTime: currentTime };
  }

  return { game: updatedGame, lastMoveTime: currentTime };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Apply zone damage to `playerId` if they are outside the current zone boundary.
 * Damage is flat ZONE_DAMAGE_PER_SECOND applied once per call (one tick).
 */
function applyZoneDamage(game: GameState, playerId: string, _currentTime: number): GameState {
  const player = game.players[playerId];
  if (!player || !player.isAlive) return game;

  const { x, y } = player.position;
  const { minX, minY, maxX, maxY } = game.zoneBoundary;
  const outsideZone = x < minX || x > maxX || y < minY || y > maxY;

  if (!outsideZone) return game;

  const newHp = Math.max(0, player.hp - ZONE_DAMAGE_PER_SECOND);
  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        hp: newHp,
        isAlive: newHp > 0,
      },
    },
  };
}

/**
 * Bounce `playerId` to any adjacent walkable tile that is not the contested tile.
 * If no adjacent tile is free the player stays put (rare edge-case).
 */
function bouncePlayer(
  game: GameState,
  playerId: string,
  contestedX: number,
  contestedY: number,
): GameState {
  const directions: Direction[] = ['up', 'down', 'left', 'right'];

  for (const dir of directions) {
    const candidate = getNewPosition(contestedX, contestedY, dir);
    if (
      candidate.x >= 0 &&
      candidate.x < game.map.width &&
      candidate.y >= 0 &&
      candidate.y < game.map.height &&
      game.map.tiles[candidate.y][candidate.x].walkable
    ) {
      return {
        ...game,
        players: {
          ...game.players,
          [playerId]: {
            ...game.players[playerId],
            position: candidate,
          },
        },
      };
    }
  }

  // No free tile found — stay at current position (revert to pre-move position)
  // The player was already moved to contestedX/Y in the caller; revert.
  const player = game.players[playerId];
  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        // If all surrounding tiles are blocked, keep them at the contested position.
        // This is an extremely unlikely edge case.
        position: { x: contestedX, y: contestedY },
      },
    },
  };
}
