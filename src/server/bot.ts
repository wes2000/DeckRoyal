import type { GameState, Player, EventTile } from '@shared/types';
import { movePlayer } from './player-handler.js';
import {
  handlePlayCard,
  handleEndTurn,
  startPvECombat,
  getSessionEnergy,
} from './combat-handler.js';
import type { CombatState } from '@shared/types';
import { handleEventInteraction, handleCardSelection } from './event-handler.js';
import { getCardById, getStarterDeck } from '@shared/cards';
import { createDeck } from '@engine/deck';
import { STARTING_HP, FREE_NON_FIGHT_EVENTS } from '@shared/constants';
import type { Direction } from './network/messages.js';

const BOT_ID = 'bot-player';
const BOT_NAME = 'Bot';
const BOT_MOVE_INTERVAL = 500; // ms between moves
const BOT_COMBAT_DELAY = 800; // ms between combat actions

// Track bot timing state
let lastBotMoveTime = 0;
let lastBotCombatAction = 0;

export function getBotId(): string {
  return BOT_ID;
}

/**
 * Create a bot player to add to the game state.
 */
export function createBotPlayer(spawnPosition: { x: number; y: number }): Player {
  const playerClass = 'warrior' as const;
  const starterCardIds = getStarterDeck(playerClass);
  const deckState = createDeck(starterCardIds);

  return {
    id: BOT_ID,
    name: BOT_NAME,
    class: playerClass,
    hp: STARTING_HP,
    maxHp: STARTING_HP,
    position: spawnPosition,
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
}

/**
 * Run one tick of bot AI. Called from the game loop.
 */
export function tickBot(game: GameState, currentTime: number): GameState {
  const bot = game.players[BOT_ID];
  if (!bot || !bot.isAlive) return game;

  // Check if bot is in combat
  const activeCombat = Object.values(game.combats).find(
    c => !c.isComplete && c.playerIds.includes(BOT_ID),
  );

  if (activeCombat) {
    return tickBotCombat(game, activeCombat, currentTime);
  }

  return tickBotOverworld(game, bot, currentTime);
}

function tickBotOverworld(game: GameState, bot: Player, currentTime: number): GameState {
  if (currentTime - lastBotMoveTime < BOT_MOVE_INTERVAL) return game;
  lastBotMoveTime = currentTime;

  // Find nearest active event
  const target = findNearestEvent(bot, game.events);

  let direction: Direction;
  if (target) {
    // Move toward the target event
    const dx = target.position.x - bot.position.x;
    const dy = target.position.y - bot.position.y;

    if (Math.abs(dx) > Math.abs(dy)) {
      direction = dx > 0 ? 'right' : 'left';
    } else {
      direction = dy > 0 ? 'down' : 'up';
    }
  } else {
    // Wander randomly
    const dirs: Direction[] = ['up', 'down', 'left', 'right'];
    direction = dirs[Math.floor(Math.random() * dirs.length)];
  }

  const result = movePlayer(game, BOT_ID, direction, currentTime);
  let updatedGame = result.game;

  // Handle triggered interactions
  if (result.triggered === 'event' && result.eventId) {
    const eventResult = handleEventInteraction(updatedGame, BOT_ID, result.eventId);
    updatedGame = eventResult.game;

    // If card choice, pick the first card
    if (eventResult.response === 'card_choice' && eventResult.data) {
      const data = eventResult.data as { cardChoices?: any[] };
      if (data.cardChoices && data.cardChoices.length > 0) {
        const choice = data.cardChoices[0];
        const cardId = typeof choice === 'string' ? choice : choice.id;
        updatedGame = handleCardSelection(updatedGame, BOT_ID, cardId);
      }
    }
  } else if (result.triggered === 'pve' && result.eventId) {
    updatedGame = startPvECombat(updatedGame, BOT_ID, result.eventId);
  }

  return updatedGame;
}

function tickBotCombat(game: GameState, combat: any, currentTime: number): GameState {
  if (currentTime - lastBotCombatAction < BOT_COMBAT_DELAY) return game;
  lastBotCombatAction = currentTime;

  // Check if it's the bot's turn
  const activePlayerId = combat.playerIds[combat.activePlayerIndex];
  if (activePlayerId !== BOT_ID) return game;

  const bot = game.players[BOT_ID];
  if (!bot) return game;

  const energy = getSessionEnergy(combat.id);

  // Try to play an affordable card from hand
  for (const cardId of bot.hand) {
    const card = getCardById(cardId);
    if (card && card.cost <= energy) {
      return handlePlayCard(game, combat.id, BOT_ID, cardId);
    }
  }

  // No affordable cards — end turn
  return handleEndTurn(game, combat.id, BOT_ID);
}

function findNearestEvent(bot: Player, events: EventTile[]): EventTile | null {
  let nearest: EventTile | null = null;
  let nearestDist = Infinity;

  for (const event of events) {
    if (!event.active) continue;
    const dist = Math.abs(event.position.x - bot.position.x)
               + Math.abs(event.position.y - bot.position.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = event;
    }
  }

  return nearest;
}
