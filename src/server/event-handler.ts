import { randomUUID } from 'crypto';
import type { GameState, EventTile } from '@shared/types';
import {
  canUseNonFightEvent,
  recordNonFightEvent,
  recordFightEvent,
} from '@engine/event-alternation';
import {
  resolveCampfire,
  resolveBlacksmith,
  resolveRandomEvent,
  resolveShrineOfSacrifice,
} from '@engine/events';
import { getRandomMonster, createMonsterState } from '@engine/monsters';
import { createPvECombat } from '@engine/combat';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EventInteractionResult {
  game: GameState;
  response:
    | 'healed'
    | 'upgrade_prompt'
    | 'combat_started'
    | 'card_choice'
    | 'random_resolved'
    | 'blocked';
  data?: unknown;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Return a new game state with the event at `eventId` set to active=false. */
function deactivateEvent(game: GameState, eventId: string): GameState {
  return {
    ...game,
    events: game.events.map((e): EventTile =>
      e.id === eventId ? { ...e, active: false } : e,
    ),
  };
}

// ---------------------------------------------------------------------------
// handleEventInteraction
// ---------------------------------------------------------------------------

export function handleEventInteraction(
  game: GameState,
  playerId: string,
  eventId: string,
): EventInteractionResult {
  // --- Validate event and player ---
  const event = game.events.find((e) => e.id === eventId);
  if (!event) return { game, response: 'blocked' };
  if (!event.active) return { game, response: 'blocked' };

  const player = game.players[playerId];
  if (!player) return { game, response: 'blocked' };

  const { type } = event;

  // ── Monster events (fight) ──────────────────────────────────────────────────
  if (type === 'small_monster' || type === 'rare_monster') {
    const tier = type === 'small_monster' ? 'small' : 'rare';
    const monsterDef = getRandomMonster(tier);
    const monsterState = createMonsterState(monsterDef);
    const combat = createPvECombat(playerId, monsterState);

    const updatedPlayer = recordFightEvent(player);

    let updatedGame: GameState = {
      ...game,
      players: {
        ...game.players,
        [playerId]: updatedPlayer,
      },
      combats: {
        ...game.combats,
        [combat.id]: combat,
      },
    };
    updatedGame = deactivateEvent(updatedGame, eventId);

    return {
      game: updatedGame,
      response: 'combat_started',
      data: { combatId: combat.id, monster: monsterState },
    };
  }

  // ── Non-fight events — check alternation rule ───────────────────────────────
  if (!canUseNonFightEvent(player)) {
    return { game, response: 'blocked' };
  }

  // ── Campfire ────────────────────────────────────────────────────────────────
  if (type === 'campfire') {
    const result = resolveCampfire(player);
    const updatedPlayer = recordNonFightEvent(result.player);

    let updatedGame: GameState = {
      ...game,
      players: {
        ...game.players,
        [playerId]: updatedPlayer,
      },
    };
    updatedGame = deactivateEvent(updatedGame, eventId);

    return { game: updatedGame, response: 'healed', data: { message: result.message } };
  }

  // ── Blacksmith ──────────────────────────────────────────────────────────────
  if (type === 'blacksmith') {
    // Actual upgrade happens when player sends 'upgradeCard'; here we prompt.
    const updatedPlayer = recordNonFightEvent(player);

    let updatedGame: GameState = {
      ...game,
      players: {
        ...game.players,
        [playerId]: updatedPlayer,
      },
    };
    updatedGame = deactivateEvent(updatedGame, eventId);

    return {
      game: updatedGame,
      response: 'upgrade_prompt',
      data: { deck: player.deck },
    };
  }

  // ── Random event ─────────────────────────────────────────────────────────────
  if (type === 'random') {
    const result = resolveRandomEvent(player);

    let updatedGame: GameState;
    let response: EventInteractionResult['response'];
    let data: unknown;

    if (result.combat) {
      // Random event triggered a fight (e.g. Ancient Chest)
      const monsterDef = getRandomMonster('small'); // fallback if no specific monster
      const monsterState = createMonsterState(monsterDef);
      // Use the monster from the event result if it has a monsterId
      const combat = createPvECombat(playerId, monsterState);

      const updatedPlayer = recordFightEvent(result.player);

      updatedGame = {
        ...game,
        players: {
          ...game.players,
          [playerId]: updatedPlayer,
        },
        combats: {
          ...game.combats,
          [combat.id]: combat,
        },
      };
      response = 'combat_started';
      data = { combatId: combat.id, monster: monsterState, message: result.message };
    } else {
      // Non-combat random outcome
      const updatedPlayer = recordNonFightEvent(result.player);

      updatedGame = {
        ...game,
        players: {
          ...game.players,
          [playerId]: updatedPlayer,
        },
      };

      if (result.cardChoices && result.cardChoices.length > 0) {
        response = 'card_choice';
        data = { cardChoices: result.cardChoices, message: result.message };
      } else {
        response = 'random_resolved';
        data = { message: result.message };
      }
    }

    updatedGame = deactivateEvent(updatedGame, eventId);
    return { game: updatedGame, response, data };
  }

  // Unhandled event type — block defensively
  return { game, response: 'blocked' };
}

// ---------------------------------------------------------------------------
// handleCardSelection — add reward card to player's deck after combat
// ---------------------------------------------------------------------------

export function handleCardSelection(
  game: GameState,
  playerId: string,
  cardId: string,
): GameState {
  const player = game.players[playerId];
  if (!player) return game;

  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: {
        ...player,
        deck: [...player.deck, cardId],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// handleUpgradeSelection — upgrade a card at the blacksmith
// ---------------------------------------------------------------------------

export function handleUpgradeSelection(
  game: GameState,
  playerId: string,
  cardId: string,
): GameState {
  const player = game.players[playerId];
  if (!player) return game;

  const result = resolveBlacksmith(player, cardId);

  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: result.player,
    },
  };
}

// ---------------------------------------------------------------------------
// handleCardRemoval — sacrifice a card at the Shrine of Sacrifice
// ---------------------------------------------------------------------------

export function handleCardRemoval(
  game: GameState,
  playerId: string,
  cardId: string,
): GameState {
  const player = game.players[playerId];
  if (!player) return game;

  const result = resolveShrineOfSacrifice(player, cardId);

  return {
    ...game,
    players: {
      ...game.players,
      [playerId]: result.player,
    },
  };
}
