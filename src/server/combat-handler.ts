import type { GameState, CombatState, Player } from '@shared/types';
import {
  createPvECombat,
  createPvPCombat,
  startTurn,
  playCard,
  endTurn,
  fleePvE,
  checkCombatEnd,
} from '@engine/combat';
import { createMonsterState, getRandomMonster } from '@engine/monsters';
import { getRewardPool } from '@shared/cards';
import { eliminatePlayer } from './game-manager';
import { isInsideZone } from '@engine/zone';
import { PVP_COOLDOWN_SECONDS } from '@shared/constants';

// ---------------------------------------------------------------------------
// Per-combat session state (tracks energy + buffs between startTurn / playCard / endTurn)
// ---------------------------------------------------------------------------

interface CombatSession {
  energy: number;
  playerBuffs: Record<string, Record<string, number>>; // playerId -> buffs
  turnStarted: boolean;
}

const combatSessions = new Map<string, CombatSession>();

function getOrCreateSession(combatId: string): CombatSession {
  if (!combatSessions.has(combatId)) {
    combatSessions.set(combatId, {
      energy: 0,
      playerBuffs: {},
      turnStarted: false,
    });
  }
  return combatSessions.get(combatId)!;
}

function clearSession(combatId: string): void {
  combatSessions.delete(combatId);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * After any combat action: check if combat is complete, increment monster kill
 * stat if appropriate, and eliminate dead players.
 */
function postActionCleanup(
  game: GameState,
  combatId: string,
  wasAlreadyComplete: boolean,
): GameState {
  let result = game;
  const combat = result.combats[combatId];
  if (!combat) return result;

  const updatedCombat = checkCombatEnd(
    combat,
    combat.playerIds.map(id => result.players[id]).filter(Boolean),
    combat.monster,
  );
  result = { ...result, combats: { ...result.combats, [combatId]: updatedCombat } };

  if (updatedCombat.isComplete && !wasAlreadyComplete) {
    clearSession(combatId);

    // PvE: monster killed — increment monstersKilled stat
    if (updatedCombat.type === 'pve' && updatedCombat.monster) {
      const monsterDead = updatedCombat.monster.hp <= 0;
      if (monsterDead) {
        for (const playerId of updatedCombat.playerIds) {
          const player = result.players[playerId];
          if (player) {
            result = {
              ...result,
              players: {
                ...result.players,
                [playerId]: {
                  ...player,
                  stats: {
                    ...player.stats,
                    monstersKilled: player.stats.monstersKilled + 1,
                  },
                },
              },
            };
          }
        }
      }
    }

    // Eliminate any dead players
    for (const playerId of updatedCombat.playerIds) {
      const player = result.players[playerId];
      if (player && (!player.isAlive || player.hp <= 0)) {
        result = eliminatePlayer(result, playerId);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// startPvECombat
// ---------------------------------------------------------------------------

export function startPvECombat(game: GameState, playerId: string, eventId: string): GameState {
  const event = game.events.find(e => e.id === eventId);
  if (!event) return game;
  if (event.type !== 'small_monster' && event.type !== 'rare_monster') return game;

  const tier = event.type === 'rare_monster' ? 'rare' : 'small';
  const monsterDef = getRandomMonster(tier);
  const monster = createMonsterState(monsterDef);

  const combat = createPvECombat(playerId, monster);

  // Deactivate the event
  const updatedEvents = game.events.map(e =>
    e.id === eventId ? { ...e, active: false } : e,
  );

  // Initialise session
  combatSessions.set(combat.id, {
    energy: 0,
    playerBuffs: { [playerId]: {} },
    turnStarted: false,
  });

  return {
    ...game,
    events: updatedEvents,
    combats: { ...game.combats, [combat.id]: combat },
  };
}

// ---------------------------------------------------------------------------
// startPvPCombat
// ---------------------------------------------------------------------------

export function startPvPCombat(game: GameState, initiatorId: string, targetId: string): GameState {
  const initiator = game.players[initiatorId];
  const target = game.players[targetId];
  if (!initiator || !target) return game;

  const combat = createPvPCombat(initiatorId, targetId, initiatorId);

  // Set PvP cooldowns on both players
  const updatedInitiator: Player = {
    ...initiator,
    pvpCooldowns: { ...initiator.pvpCooldowns, [targetId]: PVP_COOLDOWN_SECONDS },
  };
  const updatedTarget: Player = {
    ...target,
    pvpCooldowns: { ...target.pvpCooldowns, [initiatorId]: PVP_COOLDOWN_SECONDS },
  };

  // Initialise session
  combatSessions.set(combat.id, {
    energy: 0,
    playerBuffs: { [initiatorId]: {}, [targetId]: {} },
    turnStarted: false,
  });

  return {
    ...game,
    players: {
      ...game.players,
      [initiatorId]: updatedInitiator,
      [targetId]: updatedTarget,
    },
    combats: { ...game.combats, [combat.id]: combat },
  };
}

// ---------------------------------------------------------------------------
// handlePlayCard
// ---------------------------------------------------------------------------

export function handlePlayCard(
  game: GameState,
  combatId: string,
  playerId: string,
  cardId: string,
): GameState {
  const combat = game.combats[combatId];
  if (!combat) return game;

  const player = game.players[playerId];
  if (!player) return game;

  const session = getOrCreateSession(combatId);

  let currentGame = game;
  let currentCombat = combat;
  let currentPlayer = player;

  // Start the turn if this is the first card played this turn
  if (!session.turnStarted) {
    const playerBuffs = session.playerBuffs[playerId] ?? {};
    const turnResult = startTurn(currentCombat, currentPlayer, playerBuffs);
    currentCombat = turnResult.combat;
    currentPlayer = turnResult.player;
    session.energy = turnResult.energy;
    session.playerBuffs[playerId] = turnResult.buffs;
    session.turnStarted = true;

    // Persist the updated combat and player state
    currentGame = {
      ...currentGame,
      players: { ...currentGame.players, [playerId]: currentPlayer },
      combats: { ...currentGame.combats, [combatId]: currentCombat },
    };
  }

  // Determine target
  let target: Player | import('@shared/types').MonsterState;
  let targetBuffs: Record<string, number> = {};

  if (currentCombat.type === 'pve' && currentCombat.monster) {
    target = currentCombat.monster;
    targetBuffs = {};
  } else if (currentCombat.type === 'pvp') {
    // Other player is the target
    const opponentId = currentCombat.playerIds.find(id => id !== playerId);
    if (!opponentId) return currentGame;
    const opponent = currentGame.players[opponentId];
    if (!opponent) return currentGame;
    target = opponent;
    targetBuffs = session.playerBuffs[opponentId] ?? {};
  } else {
    return currentGame;
  }

  const playerBuffsNow = session.playerBuffs[playerId] ?? {};

  const result = playCard(
    currentCombat,
    currentPlayer,
    cardId,
    session.energy,
    target,
    playerBuffsNow,
    targetBuffs,
  );

  if ('error' in result) {
    // Card play failed — return current state unchanged
    return currentGame;
  }

  // Update session with new energy and buffs
  session.energy = result.energy;
  session.playerBuffs[playerId] = result.playerBuffs;

  // Apply results back to game state
  let updatedGame: GameState = {
    ...currentGame,
    players: { ...currentGame.players, [playerId]: result.player },
    combats: { ...currentGame.combats, [combatId]: result.combat },
  };

  // Update target in game state
  if (currentCombat.type === 'pvp') {
    const opponentId = currentCombat.playerIds.find(id => id !== playerId)!;
    session.playerBuffs[opponentId] = result.targetBuffs;
    updatedGame = {
      ...updatedGame,
      players: { ...updatedGame.players, [opponentId]: result.target as Player },
    };
  }
  // For PvE the monster is already in result.combat.monster

  return postActionCleanup(updatedGame, combatId, combat.isComplete);
}

// ---------------------------------------------------------------------------
// handleEndTurn
// ---------------------------------------------------------------------------

export function handleEndTurn(
  game: GameState,
  combatId: string,
  playerId: string,
): GameState {
  const combat = game.combats[combatId];
  if (!combat) return game;

  const player = game.players[playerId];
  if (!player) return game;

  // If the turn hasn't been started yet (player ended without playing cards),
  // start it first so we process any tick effects correctly.
  const session = getOrCreateSession(combatId);

  let currentGame = game;
  let currentCombat = combat;
  let currentPlayer = player;

  if (!session.turnStarted) {
    const playerBuffs = session.playerBuffs[playerId] ?? {};
    const turnResult = startTurn(currentCombat, currentPlayer, playerBuffs);
    currentCombat = turnResult.combat;
    currentPlayer = turnResult.player;
    session.energy = turnResult.energy;
    session.playerBuffs[playerId] = turnResult.buffs;
    session.turnStarted = true;

    currentGame = {
      ...currentGame,
      players: { ...currentGame.players, [playerId]: currentPlayer },
      combats: { ...currentGame.combats, [combatId]: currentCombat },
    };
  }

  // Determine PvP opponent (if any)
  let pvpOpponent: Player | undefined;
  let opponentBuffs: Record<string, number> = {};
  if (currentCombat.type === 'pvp') {
    const opponentId = currentCombat.playerIds.find(id => id !== playerId);
    if (opponentId) {
      pvpOpponent = currentGame.players[opponentId];
      opponentBuffs = session.playerBuffs[opponentId] ?? {};
    }
  }

  const playerBuffs = session.playerBuffs[playerId] ?? {};
  const endResult = endTurn(currentCombat, currentPlayer, pvpOpponent, playerBuffs, opponentBuffs);

  // Reset session for next turn
  session.turnStarted = false;
  session.energy = 0;
  session.playerBuffs[playerId] = endResult.playerBuffs ?? {};

  let updatedGame: GameState = {
    ...currentGame,
    players: { ...currentGame.players, [playerId]: endResult.player },
    combats: { ...currentGame.combats, [combatId]: endResult.combat },
  };

  // Update PvP opponent if present
  if (currentCombat.type === 'pvp' && pvpOpponent && endResult.target) {
    const opponentId = currentCombat.playerIds.find(id => id !== playerId)!;
    session.playerBuffs[opponentId] = endResult.targetBuffs ?? {};
    updatedGame = {
      ...updatedGame,
      players: { ...updatedGame.players, [opponentId]: endResult.target },
    };
  }

  return postActionCleanup(updatedGame, combatId, combat.isComplete);
}

// ---------------------------------------------------------------------------
// handleFlee
// ---------------------------------------------------------------------------

export function handleFlee(
  game: GameState,
  combatId: string,
  playerId: string,
): GameState {
  const combat = game.combats[combatId];
  if (!combat) return game;

  const player = game.players[playerId];
  if (!player) return game;

  const fleeResult = fleePvE(combat, player);

  if ('error' in fleeResult) {
    // Cannot flee — return game unchanged
    return game;
  }

  clearSession(combatId);

  let updatedGame: GameState = {
    ...game,
    players: { ...game.players, [playerId]: fleeResult.player },
    combats: { ...game.combats, [combatId]: fleeResult.combat },
  };

  // Eliminate player if flee cost killed them
  if (!fleeResult.player.isAlive || fleeResult.player.hp <= 0) {
    updatedGame = eliminatePlayer(updatedGame, playerId);
  }

  return updatedGame;
}

// ---------------------------------------------------------------------------
// checkTurnTimer
// ---------------------------------------------------------------------------

export function checkTurnTimer(
  game: GameState,
  combatId: string,
  currentTime: number,
): GameState {
  const combat = game.combats[combatId];
  if (!combat) return game;
  if (combat.isComplete) return game;

  // turnTimer holds the deadline (timestamp or countdown seconds).
  // If currentTime >= turnTimer the timer has expired.
  if (currentTime < combat.turnTimer) return game;

  // Auto-end the turn for the active player
  const activePlayerId = combat.playerIds[combat.activePlayerIndex];
  if (!activePlayerId) return game;

  return handleEndTurn(game, combatId, activePlayerId);
}

// ---------------------------------------------------------------------------
// handleZoneInterruption
// ---------------------------------------------------------------------------

export function handleZoneInterruption(game: GameState, combatId: string): GameState {
  const combat = game.combats[combatId];
  if (!combat) return game;
  if (combat.isComplete) return game;

  // Check if any combat participant is outside the zone
  let outsideZone = false;
  for (const playerId of combat.playerIds) {
    const player = game.players[playerId];
    if (player && !isInsideZone(player.position, game.zoneBoundary)) {
      outsideZone = true;
      break;
    }
  }

  if (!outsideZone) return game;

  // End the combat immediately
  clearSession(combatId);

  const completedCombat: CombatState = { ...combat, isComplete: true };
  return {
    ...game,
    combats: { ...game.combats, [combatId]: completedCombat },
  };
}
