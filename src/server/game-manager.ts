import type { GameState, Player } from '@shared/types';
import type { Lobby } from './lobby';
import { generateMap, placeEvents, getSpawnPoints } from '@engine/map-generator';
import { getStarterDeck } from '@shared/cards';
import { createDeck } from '@engine/deck';
import { getZoneBoundary } from '@engine/zone';
import { STARTING_HP, MAP_WIDTH, MAP_HEIGHT, FREE_NON_FIGHT_EVENTS } from '@shared/constants';

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function initializeGame(lobby: Lobby): GameState {
  const playerCount = lobby.players.size;
  const map = generateMap(MAP_WIDTH, MAP_HEIGHT);
  const events = placeEvents(map, playerCount);
  const spawnPoints = getSpawnPoints(map, playerCount, events);

  const lobbyPlayers = Array.from(lobby.players.values());
  const players: Record<string, Player> = {};

  lobbyPlayers.forEach((lobbyPlayer, index) => {
    const playerClass = lobbyPlayer.class ?? 'warrior';
    const starterCardIds = getStarterDeck(playerClass);
    const deckState = createDeck(starterCardIds);

    const position = spawnPoints[index] ?? { x: 0, y: 0 };

    const player: Player = {
      id: lobbyPlayer.id,
      name: lobbyPlayer.name,
      class: playerClass,
      hp: STARTING_HP,
      maxHp: STARTING_HP,
      position,
      deck: starterCardIds,
      hand: [],
      drawPile: deckState.drawPile,
      discardPile: [],
      block: 0,
      isAlive: true,
      freeNonFightEvents: FREE_NON_FIGHT_EVENTS,
      needsFight: false,
      pvpCooldowns: {},
      stats: {
        damageDealt: 0,
        cardsPlayed: 0,
        monstersKilled: 0,
        eventsClaimed: 0,
      },
    };

    players[lobbyPlayer.id] = player;
  });

  const zoneBoundary = getZoneBoundary(MAP_WIDTH, MAP_HEIGHT, 0);

  return {
    id: generateId(),
    phase: 'lobby',
    players,
    map,
    events,
    elapsed: 0,
    zonePhase: 0,
    zoneBoundary,
    combats: {},
  };
}

export function startCountdown(game: GameState): GameState {
  return { ...game, phase: 'countdown' };
}

export function startGame(game: GameState): GameState {
  return { ...game, phase: 'playing', elapsed: 0 };
}

export function eliminatePlayer(game: GameState, playerId: string): GameState {
  const player = game.players[playerId];
  if (!player) return game;

  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: { ...player, isAlive: false },
    },
  };
}

export function checkWinCondition(game: GameState): string | null {
  const alivePlayers = Object.values(game.players).filter(p => p.isAlive);
  if (alivePlayers.length === 1) {
    return alivePlayers[0].id;
  }
  return null;
}

export function getPlayerView(game: GameState, playerId: string): unknown {
  const sanitizedPlayers: Record<string, unknown> = {};

  for (const [id, player] of Object.entries(game.players)) {
    if (id === playerId) {
      // Own player — full visibility
      sanitizedPlayers[id] = { ...player };
    } else {
      // Other players — hide hand and drawPile (replace with lengths)
      const { hand, drawPile, ...publicFields } = player;
      sanitizedPlayers[id] = {
        ...publicFields,
        hand: hand.length,
        drawPile: drawPile.length,
      };
    }
  }

  return {
    id: game.id,
    phase: game.phase,
    players: sanitizedPlayers,
    map: game.map,
    events: game.events,
    elapsed: game.elapsed,
    zonePhase: game.zonePhase,
    zoneBoundary: game.zoneBoundary,
    combats: game.combats,
  };
}
