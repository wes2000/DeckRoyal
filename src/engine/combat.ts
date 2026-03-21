import { randomUUID } from 'crypto';
import {
  STARTING_ENERGY,
  ENERGY_PER_TURN,
  CARDS_PER_DRAW,
  PVP_DAMAGE_CAP,
  PVP_MAX_ROUNDS,
  FLEE_HP_COST,
  TURN_TIMER_SECONDS,
} from '@shared/constants';
import { drawCards, discardHand, discardCard } from './deck';
import type { DeckState } from './deck';
import {
  resolveCardEffects,
  resetBlock,
  tickPoison,
  tickBurn,
  applyDamage,
  applyBlock,
  applyBuff,
} from './card-effects';
import type { CombatantState } from './card-effects';
import { getCardById } from '@shared/cards';
import { MONSTERS, getMonsterIntent, advanceMonsterPattern } from './monsters';
import type { CombatState, Player, MonsterState } from '@shared/types';

// ---------------------------------------------------------------------------
// Type conversion helpers
// ---------------------------------------------------------------------------

function playerToCombatant(player: Player, buffs: Record<string, number> = {}): CombatantState {
  return {
    hp: player.hp,
    maxHp: player.maxHp,
    block: player.block,
    buffs: { ...buffs },
  };
}

function applyCombatantToPlayer(player: Player, combatant: CombatantState): Player {
  return {
    ...player,
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    block: combatant.block,
    isAlive: combatant.hp > 0,
  };
}

function monsterToCombatant(monster: MonsterState): CombatantState {
  return {
    hp: monster.hp,
    maxHp: monster.maxHp,
    block: monster.block,
    buffs: { ...monster.buffs },
  };
}

function applyCombatantToMonster(monster: MonsterState, combatant: CombatantState): MonsterState {
  return {
    ...monster,
    hp: combatant.hp,
    maxHp: combatant.maxHp,
    block: combatant.block,
    buffs: { ...combatant.buffs },
  };
}

function playerToDeck(player: Player): DeckState {
  return {
    drawPile: [...player.drawPile],
    hand: [...player.hand],
    discardPile: [...player.discardPile],
  };
}

function applyDeckToPlayer(player: Player, deck: DeckState): Player {
  return {
    ...player,
    drawPile: deck.drawPile,
    hand: deck.hand,
    discardPile: deck.discardPile,
  };
}

// ---------------------------------------------------------------------------
// Combat creation
// ---------------------------------------------------------------------------

export function createPvECombat(playerId: string, monster: MonsterState): CombatState {
  return {
    id: randomUUID(),
    type: 'pve',
    playerIds: [playerId],
    activePlayerIndex: 0,
    turnCounters: { [playerId]: 0 },
    round: 1,
    maxRounds: 0, // no round limit for PvE
    damageTracker: { [playerId]: 0 },
    damageCap: 0, // no damage cap for PvE
    monster: { ...monster, buffs: { ...monster.buffs } },
    turnTimer: TURN_TIMER_SECONDS,
    isComplete: false,
  };
}

export function createPvPCombat(
  player1Id: string,
  player2Id: string,
  initiatorId: string,
): CombatState {
  // Initiator goes first
  const playerIds = initiatorId === player1Id
    ? [player1Id, player2Id]
    : [player2Id, player1Id];

  return {
    id: randomUUID(),
    type: 'pvp',
    playerIds,
    activePlayerIndex: 0,
    turnCounters: { [player1Id]: 0, [player2Id]: 0 },
    round: 1,
    maxRounds: PVP_MAX_ROUNDS,
    damageTracker: { [player1Id]: 0, [player2Id]: 0 },
    damageCap: PVP_DAMAGE_CAP,
    turnTimer: TURN_TIMER_SECONDS,
    isComplete: false,
  };
}

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

export function getEnergyForTurn(turnNumber: number): number {
  return STARTING_ENERGY + (turnNumber - 1) * ENERGY_PER_TURN;
}

// ---------------------------------------------------------------------------
// Start turn
// ---------------------------------------------------------------------------

/**
 * Result of starting a turn. Callers MUST pass the returned `energy` and `buffs`
 * back into `playCard` and `endTurn` for all subsequent calls within the same turn,
 * as these values represent the authoritative in-turn state (block reset, buffs ticked).
 */
export interface StartTurnResult {
  combat: CombatState;
  player: Player;
  energy: number;
  buffs: Record<string, number>;
}

export function startTurn(
  combat: CombatState,
  player: Player,
  playerBuffs: Record<string, number> = {},
): StartTurnResult {
  const playerId = player.id;

  // Increment turn counter
  const newTurnCounter = (combat.turnCounters[playerId] ?? 0) + 1;
  const newCombat: CombatState = {
    ...combat,
    turnCounters: { ...combat.turnCounters, [playerId]: newTurnCounter },
    turnTimer: TURN_TIMER_SECONDS,
  };

  // Reset block via card-effects
  const combatant = playerToCombatant(player, playerBuffs);
  const resetCombatant = resetBlock(combatant);
  let updatedPlayer = applyCombatantToPlayer(player, resetCombatant);

  // Draw cards
  const deck = playerToDeck(updatedPlayer);
  const newDeck = drawCards(deck, CARDS_PER_DRAW);
  updatedPlayer = applyDeckToPlayer(updatedPlayer, newDeck);

  // Calculate energy
  const energy = getEnergyForTurn(newTurnCounter);

  return {
    combat: newCombat,
    player: updatedPlayer,
    energy,
    buffs: { ...resetCombatant.buffs },
  };
}

// ---------------------------------------------------------------------------
// Play card
// ---------------------------------------------------------------------------

/**
 * Successful result of playing a card. Callers MUST pass the returned `energy` and
 * `playerBuffs` (and `targetBuffs` where applicable) back into subsequent `playCard`
 * or `endTurn` calls for the same turn to preserve accumulated in-turn state.
 */
export interface PlayCardSuccess {
  combat: CombatState;
  player: Player;
  target: Player | MonsterState;
  energy: number;
  playerBuffs: Record<string, number>;
  targetBuffs: Record<string, number>;
}

export interface PlayCardError {
  error: string;
}

export function playCard(
  combat: CombatState,
  player: Player,
  cardId: string,
  energy: number,
  target: Player | MonsterState,
  playerBuffs: Record<string, number> = {},
  targetBuffs: Record<string, number> = {},
): PlayCardSuccess | PlayCardError {
  // Check it's the player's turn
  const activePlayerId = combat.playerIds[combat.activePlayerIndex];
  if (player.id !== activePlayerId) {
    return { error: "Not this player's turn" };
  }

  // Look up card
  const card = getCardById(cardId);
  if (!card) {
    return { error: `Card not found: ${cardId}` };
  }

  // Check card is in hand
  if (!player.hand.includes(cardId)) {
    return { error: `Card ${cardId} is not in hand` };
  }

  // Check energy
  if (energy < card.cost) {
    return { error: `Not enough energy (have ${energy}, need ${card.cost})` };
  }

  // Convert to combatant states
  const attackerCombatant = playerToCombatant(player, playerBuffs);
  const isMonsterTarget = 'patternIndex' in target;
  const defenderCombatant = isMonsterTarget
    ? monsterToCombatant(target as MonsterState)
    : playerToCombatant(target as Player, targetBuffs);

  // Resolve card effects
  const deck = playerToDeck(player);
  const result = resolveCardEffects(card, attackerCombatant, defenderCombatant, deck);

  // Discard the played card
  const newDeck = discardCard(result.deck, cardId);

  // Apply results back
  let updatedPlayer = applyCombatantToPlayer(player, result.attacker);
  updatedPlayer = applyDeckToPlayer(updatedPlayer, newDeck);
  updatedPlayer = {
    ...updatedPlayer,
    stats: {
      ...updatedPlayer.stats,
      cardsPlayed: updatedPlayer.stats.cardsPlayed + 1,
    },
  };

  let updatedTarget: Player | MonsterState;
  let newTargetBuffs: Record<string, number>;

  if (isMonsterTarget) {
    updatedTarget = applyCombatantToMonster(target as MonsterState, result.defender);
    newTargetBuffs = { ...result.defender.buffs };
  } else {
    updatedTarget = applyCombatantToPlayer(target as Player, result.defender);
    newTargetBuffs = { ...result.defender.buffs };
  }

  // Track damage for PvP
  let newCombat = combat;
  if (combat.type === 'pvp' && !isMonsterTarget) {
    const targetPlayer = target as Player;
    const damageTaken = targetPlayer.hp - (updatedTarget as Player).hp;
    if (damageTaken > 0) {
      newCombat = {
        ...combat,
        damageTracker: {
          ...combat.damageTracker,
          [targetPlayer.id]: (combat.damageTracker[targetPlayer.id] ?? 0) + damageTaken,
        },
      };
      updatedPlayer = {
        ...updatedPlayer,
        stats: {
          ...updatedPlayer.stats,
          damageDealt: updatedPlayer.stats.damageDealt + damageTaken,
        },
      };
    }
  } else if (combat.type === 'pve' && isMonsterTarget) {
    const damageTaken = (target as MonsterState).hp - (updatedTarget as MonsterState).hp;
    if (damageTaken > 0) {
      updatedPlayer = {
        ...updatedPlayer,
        stats: {
          ...updatedPlayer.stats,
          damageDealt: updatedPlayer.stats.damageDealt + damageTaken,
        },
      };
    }
  }

  // Update monster in combat state if target is monster
  if (isMonsterTarget) {
    newCombat = {
      ...newCombat,
      monster: updatedTarget as MonsterState,
    };
  }

  return {
    combat: newCombat,
    player: updatedPlayer,
    target: updatedTarget,
    energy: energy - card.cost,
    playerBuffs: { ...result.attacker.buffs },
    targetBuffs: newTargetBuffs,
  };
}

// ---------------------------------------------------------------------------
// End turn
// ---------------------------------------------------------------------------

export interface EndTurnResult {
  combat: CombatState;
  player: Player;
  target?: Player;
  playerBuffs?: Record<string, number>;
  targetBuffs?: Record<string, number>;
}

export function endTurn(
  combat: CombatState,
  player: Player,
  pvpOpponent?: Player,
  playerBuffs: Record<string, number> = {},
  opponentBuffs: Record<string, number> = {},
): EndTurnResult {
  // Discard hand
  const deck = playerToDeck(player);
  const newDeck = discardHand(deck);
  let updatedPlayer = applyDeckToPlayer(player, newDeck);

  // Tick poison on player
  const playerCombatant = playerToCombatant(updatedPlayer, playerBuffs);
  const poisonedPlayer = tickPoison(playerCombatant);
  const burnedPlayer = tickBurn(poisonedPlayer);
  updatedPlayer = applyCombatantToPlayer(updatedPlayer, burnedPlayer);
  const newPlayerBuffs = { ...burnedPlayer.buffs };

  let newCombat = { ...combat };
  let updatedOpponent = pvpOpponent;
  let newOpponentBuffs = opponentBuffs;

  if (combat.type === 'pve' && combat.monster) {
    // Monster acts
    const monsterDef = MONSTERS.find(m => m.id === combat.monster!.id);
    if (monsterDef) {
      // Reset monster block at the start of its action phase
      const monsterWithResetBlock = applyCombatantToMonster(
        combat.monster,
        resetBlock(monsterToCombatant(combat.monster)),
      );
      const monster = monsterWithResetBlock;
      const action = getMonsterIntent(monster, monsterDef);

      let updatedMonster = monster;

      switch (action.type) {
        case 'attack': {
          const monCombatant = monsterToCombatant(monster);
          const playerDef = playerToCombatant(updatedPlayer, newPlayerBuffs);
          const dmgResult = applyDamage(action.value, monCombatant, playerDef);
          updatedPlayer = applyCombatantToPlayer(updatedPlayer, dmgResult.defender);
          break;
        }
        case 'defend': {
          const monCombatant = monsterToCombatant(monster);
          const blocked = applyBlock(action.value, monCombatant);
          updatedMonster = applyCombatantToMonster(monster, blocked);
          break;
        }
        case 'buff': {
          if (action.buff) {
            const monCombatant = monsterToCombatant(monster);
            const buffed = applyBuff(monCombatant, action.buff, action.value);
            updatedMonster = applyCombatantToMonster(monster, buffed);
          }
          break;
        }
      }

      // Advance monster pattern
      updatedMonster = advanceMonsterPattern(updatedMonster, monsterDef);

      // Tick monster poison/burn
      let monCombatant = monsterToCombatant(updatedMonster);
      monCombatant = tickPoison(monCombatant);
      monCombatant = tickBurn(monCombatant);
      updatedMonster = applyCombatantToMonster(updatedMonster, monCombatant);

      newCombat = { ...newCombat, monster: updatedMonster };
    }
  } else if (combat.type === 'pvp') {
    // Switch active player
    const nextIndex = (combat.activePlayerIndex + 1) % combat.playerIds.length;
    newCombat = { ...newCombat, activePlayerIndex: nextIndex };

    // If we've gone back to player 0, that means both have acted -> increment round
    if (nextIndex === 0) {
      newCombat = { ...newCombat, round: newCombat.round + 1 };
    }
  }

  return {
    combat: newCombat,
    player: updatedPlayer,
    target: updatedOpponent,
    playerBuffs: newPlayerBuffs,
    targetBuffs: newOpponentBuffs ? { ...newOpponentBuffs } : undefined,
  };
}

// ---------------------------------------------------------------------------
// Flee (PvE only)
// ---------------------------------------------------------------------------

export function fleePvE(
  combat: CombatState,
  player: Player,
): { combat: CombatState; player: Player } | { error: string } {
  if (combat.type !== 'pve') {
    return { error: 'Can only flee from PvE combat' };
  }

  const turnCount = combat.turnCounters[player.id] ?? 0;
  // turnCounter is incremented in startTurn, so after the player's first turn it equals 1.
  // Guard against <= 1 to block fleeing on turn 1.
  if (turnCount <= 1) {
    return { error: 'Cannot flee on turn 1' };
  }

  const newHp = Math.max(0, player.hp - FLEE_HP_COST);
  const updatedPlayer: Player = {
    ...player,
    hp: newHp,
    isAlive: newHp > 0,
  };

  const newCombat: CombatState = {
    ...combat,
    isComplete: true,
  };

  return { combat: newCombat, player: updatedPlayer };
}

// ---------------------------------------------------------------------------
// Check combat end conditions
// ---------------------------------------------------------------------------

export function checkCombatEnd(
  combat: CombatState,
  players: Player[],
  monster?: MonsterState,
): CombatState {
  if (combat.isComplete) return combat;

  // PvE: check if monster is dead
  if (combat.type === 'pve') {
    const mon = monster ?? combat.monster;
    if (mon && mon.hp <= 0) {
      return { ...combat, isComplete: true };
    }
  }

  // Check if any player is dead
  for (const player of players) {
    if (combat.playerIds.includes(player.id) && (!player.isAlive || player.hp <= 0)) {
      return { ...combat, isComplete: true };
    }
  }

  // PvP: check damage cap
  if (combat.type === 'pvp' && combat.damageCap > 0) {
    for (const playerId of combat.playerIds) {
      if ((combat.damageTracker[playerId] ?? 0) >= combat.damageCap) {
        return { ...combat, isComplete: true };
      }
    }
  }

  // PvP: check max rounds
  if (combat.type === 'pvp' && combat.maxRounds > 0 && combat.round > combat.maxRounds) {
    return { ...combat, isComplete: true };
  }

  return combat;
}
