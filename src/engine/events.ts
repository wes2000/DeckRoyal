import type { Player } from '@shared/types';
import type { CardDefinition } from '@shared/cards/types';
import { CAMPFIRE_HEAL_RANGE, MAX_HP_CAP } from '@shared/constants';
import { getCardById, getRewardPool } from '@shared/cards';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export interface EventResult {
  player: Player;
  cardChoices?: CardDefinition[];  // cards to pick from
  combat?: { monsterId: string };  // fight triggered
  message: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Random integer in [min, max] inclusive */
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Clamp a value between lo and hi */
function clamp(value: number, lo: number, hi: number): number {
  return Math.min(Math.max(value, lo), hi);
}

// ---------------------------------------------------------------------------
// resolveCampfire
// ---------------------------------------------------------------------------

export function resolveCampfire(player: Player): EventResult {
  const heal = randomInt(CAMPFIRE_HEAL_RANGE.min, CAMPFIRE_HEAL_RANGE.max);
  const effectiveMaxHp = Math.min(player.maxHp, MAX_HP_CAP);
  const newHp = clamp(player.hp + heal, 0, effectiveMaxHp);
  const healed = newHp - player.hp;

  return {
    player: { ...player, hp: newHp },
    message: `You rest at the campfire and recover ${healed} HP. (${newHp}/${effectiveMaxHp})`,
  };
}

// ---------------------------------------------------------------------------
// resolveBlacksmith
// ---------------------------------------------------------------------------

export function resolveBlacksmith(player: Player, cardId: string): EventResult {
  const cardDef = getCardById(cardId);

  if (!cardDef) {
    return {
      player,
      message: `Card not found: "${cardId}".`,
    };
  }

  if (!player.deck.includes(cardId)) {
    return {
      player,
      message: `Card "${cardId}" is not in deck.`,
    };
  }

  if (cardDef.upgraded) {
    return {
      player,
      message: `"${cardDef.name}" is already upgraded.`,
    };
  }

  if (!cardDef.upgradeId) {
    return {
      player,
      message: `"${cardDef.name}" has no upgrade path.`,
    };
  }

  // Replace only the first occurrence in the deck
  const idx = player.deck.indexOf(cardId);
  const newDeck = [...player.deck];
  newDeck[idx] = cardDef.upgradeId;
  const upgradedDef = getCardById(cardDef.upgradeId);
  const upgradedName = upgradedDef ? upgradedDef.name : cardDef.upgradeId;

  return {
    player: { ...player, deck: newDeck },
    message: `The blacksmith upgrades "${cardDef.name}" to "${upgradedName}".`,
  };
}

// ---------------------------------------------------------------------------
// resolveWanderingMerchant
// ---------------------------------------------------------------------------

export function resolveWanderingMerchant(player: Player): EventResult {
  const HP_COST = 15;
  const pool = getRewardPool(player.class, 'rare');

  // Pick 3 distinct rare cards
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const choices = shuffled.slice(0, 3);

  const newHp = Math.max(0, player.hp - HP_COST);

  return {
    player: { ...player, hp: newHp },
    cardChoices: choices,
    message: `A wandering merchant offers you 3 rare cards for ${HP_COST} HP.`,
  };
}

// ---------------------------------------------------------------------------
// resolveHealingSpring
// ---------------------------------------------------------------------------

export function resolveHealingSpring(player: Player): EventResult {
  const HEAL_AMOUNT = 15;
  const effectiveMaxHp = Math.min(player.maxHp, MAX_HP_CAP);
  const newHp = clamp(player.hp + HEAL_AMOUNT, 0, effectiveMaxHp);

  // Upgrade a random upgradeable card in the deck
  const upgradeableIndices = player.deck
    .map((id, idx) => ({ id, idx }))
    .filter(({ id }) => {
      const def = getCardById(id);
      return def && !def.upgraded && def.upgradeId;
    });

  let newDeck = [...player.deck];
  let upgradeMessage = '';

  if (upgradeableIndices.length > 0) {
    const chosen = upgradeableIndices[Math.floor(Math.random() * upgradeableIndices.length)];
    const def = getCardById(chosen.id)!;
    newDeck[chosen.idx] = def.upgradeId!;
    upgradeMessage = ` "${def.name}" was also upgraded.`;
  }

  return {
    player: { ...player, hp: newHp, deck: newDeck },
    message: `The healing spring restores 15 HP.${upgradeMessage}`,
  };
}

// ---------------------------------------------------------------------------
// resolveShrineOfSacrifice
// ---------------------------------------------------------------------------

export function resolveShrineOfSacrifice(player: Player, cardId: string): EventResult {
  const idx = player.deck.indexOf(cardId);
  if (idx === -1) {
    return {
      player,
      message: `Card "${cardId}" is not in deck.`,
    };
  }

  const cardDef = getCardById(cardId);
  const cardName = cardDef ? cardDef.name : cardId;

  const newDeck = [...player.deck];
  newDeck.splice(idx, 1);

  return {
    player: { ...player, deck: newDeck },
    message: `You sacrifice "${cardName}" at the shrine. It is gone forever.`,
  };
}

// ---------------------------------------------------------------------------
// resolveAncientChest
// ---------------------------------------------------------------------------

/** Mini-boss monster id for Ancient Chest encounters. */
const ANCIENT_CHEST_MONSTER_ID = 'chest_guardian';

export function resolveAncientChest(player: Player): EventResult {
  return {
    player,
    combat: { monsterId: ANCIENT_CHEST_MONSTER_ID },
    message: `The ancient chest springs open — a guardian emerges!`,
  };
}

// ---------------------------------------------------------------------------
// resolveSoulBargain
// ---------------------------------------------------------------------------

export function resolveSoulBargain(player: Player): EventResult {
  const MAX_HP_REDUCTION = 15;
  const newMaxHp = Math.max(1, player.maxHp - MAX_HP_REDUCTION);

  // Offer the best (powerful) card for the player's class
  const pool = getRewardPool(player.class, 'rare');
  const bestCard = pool[0]; // getRewardPool('rare') returns powerful tier cards

  const newDeck = bestCard ? [...player.deck, bestCard.id] : [...player.deck];
  const cardChoices = bestCard ? [bestCard] : [];

  const cardName = bestCard ? bestCard.name : 'nothing';

  return {
    player: { ...player, maxHp: newMaxHp, deck: newDeck },
    cardChoices,
    message: `You bargain with the soul — max HP reduced by ${MAX_HP_REDUCTION}. You gain "${cardName}".`,
  };
}

// ---------------------------------------------------------------------------
// resolveRandomEvent (pool-based)
//
// Pool weights:  50% shared  |  25% class  |  25% gambling
// Shared pool:   Wandering Merchant, Healing Spring
// Class pool:    (class-specific — generic fallback uses Healing Spring)
// Gambling pool: Shrine of Sacrifice, Ancient Chest, Soul Bargain
// ---------------------------------------------------------------------------

type RandomEventResolver = (player: Player) => EventResult;

function resolveClassEvent(player: Player): EventResult {
  // Generic class event: a blessing tuned to the player's class
  const pool = getRewardPool(player.class, 'small');
  if (pool.length === 0) {
    return resolveHealingSpring(player);
  }
  const card = pool[Math.floor(Math.random() * pool.length)];
  const newDeck = [...player.deck, card.id];
  return {
    player: { ...player, deck: newDeck },
    cardChoices: [card],
    message: `A ${player.class} spirit blesses you with "${card.name}".`,
  };
}

const SHARED_POOL: RandomEventResolver[] = [
  resolveWanderingMerchant,
  resolveHealingSpring,
];

const GAMBLING_POOL: RandomEventResolver[] = [
  (player) => {
    // Shrine of Sacrifice picks a random card from deck
    if (player.deck.length === 0) {
      return {
        player,
        message: 'The shrine finds nothing to sacrifice.',
      };
    }
    const idx = Math.floor(Math.random() * player.deck.length);
    return resolveShrineOfSacrifice(player, player.deck[idx]);
  },
  resolveAncientChest,
  resolveSoulBargain,
];

export function resolveRandomEvent(player: Player): EventResult {
  const roll = Math.random();

  if (roll < 0.5) {
    // Shared pool (50%)
    const resolver = SHARED_POOL[Math.floor(Math.random() * SHARED_POOL.length)];
    return resolver(player);
  } else if (roll < 0.75) {
    // Class pool (25%)
    return resolveClassEvent(player);
  } else {
    // Gambling pool (25%)
    const resolver = GAMBLING_POOL[Math.floor(Math.random() * GAMBLING_POOL.length)];
    return resolver(player);
  }
}
