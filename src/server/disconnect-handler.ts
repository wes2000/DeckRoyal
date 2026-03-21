import type { GameState } from '@shared/types';
import { eliminatePlayer } from './game-manager';

export interface DisconnectTimer {
  playerId: string;
  disconnectedAt: number;
  timeout: number;  // 30s for overworld/pvp, 15s for PvE
  context: 'overworld' | 'pvp' | 'pve';
}

// ---------------------------------------------------------------------------
// Determine disconnect context for a player
// ---------------------------------------------------------------------------

function getDisconnectContext(game: GameState, playerId: string): 'overworld' | 'pvp' | 'pve' {
  for (const combat of Object.values(game.combats)) {
    if (!combat.isComplete && combat.playerIds.includes(playerId)) {
      return combat.type === 'pve' ? 'pve' : 'pvp';
    }
  }
  return 'overworld';
}

// ---------------------------------------------------------------------------
// handleDisconnect
// ---------------------------------------------------------------------------

/**
 * Called when a player disconnects. Returns the (possibly unchanged) game
 * and a timer the server should store. The player is NOT immediately
 * eliminated — the timer decides what happens next.
 *
 * Timeout rules:
 *   overworld / pvp → 30 seconds
 *   pve             → 15 seconds
 */
export function handleDisconnect(
  game: GameState,
  playerId: string,
  currentTime: number,
): { game: GameState; timer: DisconnectTimer } {
  const context = getDisconnectContext(game, playerId);
  const timeout = context === 'pve' ? 15 : 30;

  const timer: DisconnectTimer = {
    playerId,
    disconnectedAt: currentTime,
    timeout,
    context,
  };

  // Game state itself is not mutated here — the player simply has a pending
  // timer. The server will call checkDisconnectTimers each tick.
  return { game, timer };
}

// ---------------------------------------------------------------------------
// handleReconnect
// ---------------------------------------------------------------------------

/**
 * Called when a player successfully reconnects before their timer expires.
 * Returns the game state with the player's session resumed.
 * The server is responsible for removing the associated DisconnectTimer.
 */
export function handleReconnect(game: GameState, playerId: string): GameState {
  const player = game.players[playerId];
  if (!player) return game;

  // Player is already in the game — nothing to change in pure state terms.
  // The server will drop the timer, restoring normal flow.
  return game;
}

// ---------------------------------------------------------------------------
// checkDisconnectTimers
// ---------------------------------------------------------------------------

/**
 * Called each server tick. Inspects all active disconnect timers and:
 *   - Eliminates players whose overworld/pve timers have expired.
 *   - For pvp context, adds the player to `expired` so the server can
 *     auto-pass their turn (they are NOT eliminated).
 *
 * Returns the updated game and a list of expired player IDs.
 * The server should remove expired timers from its store after this call.
 *
 * Time is compared in milliseconds: a timer expires when
 *   currentTime >= disconnectedAt + timeout * 1000
 */
export function checkDisconnectTimers(
  game: GameState,
  timers: DisconnectTimer[],
  currentTime: number,
): { game: GameState; expired: string[] } {
  let result = game;
  const expired: string[] = [];

  for (const timer of timers) {
    const deadline = timer.disconnectedAt + timer.timeout * 1000;
    if (currentTime < deadline) continue;

    expired.push(timer.playerId);

    if (timer.context === 'pvp') {
      // PvP: turns auto-pass — do not eliminate the player.
      // The caller handles the auto-pass logic.
      continue;
    }

    // Overworld / PvE: eliminate the player.
    result = eliminatePlayer(result, timer.playerId);
  }

  return { game: result, expired };
}

// ---------------------------------------------------------------------------
// migrateHost
// ---------------------------------------------------------------------------

/**
 * Called when the host of a game disconnects.
 *
 * Host status is a lobby-level concept (tracked in Lobby.hostId) and is not
 * stored in GameState. Therefore this function returns the game state
 * unchanged — the caller (server/lobby layer) is responsible for updating
 * the Lobby record.
 *
 * If a `hostId` field is ever added to GameState in the future, this
 * function would be the place to update it.
 */
export function migrateHost(game: GameState, disconnectedHostId: string): GameState {
  // Validate the player exists in the game (no-op if not found).
  if (!game.players[disconnectedHostId]) return game;

  // Host migration is a lobby concern — return game unchanged.
  return game;
}
