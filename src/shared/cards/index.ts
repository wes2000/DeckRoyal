import type { CardDefinition } from './types';
import type { PlayerClass } from '../types';
import { WARRIOR_CARDS } from './warrior';
import { MAGE_CARDS } from './mage';
import { ROGUE_CARDS } from './rogue';

const ALL_CARDS: CardDefinition[] = [...WARRIOR_CARDS, ...MAGE_CARDS, ...ROGUE_CARDS];
const CARD_MAP = new Map<string, CardDefinition>(ALL_CARDS.map(c => [c.id, c]));

export function getCardById(id: string): CardDefinition | undefined { return CARD_MAP.get(id); }

export function getCardsByClass(playerClass: PlayerClass): CardDefinition[] {
  return ALL_CARDS.filter(c => c.class === playerClass);
}

const STARTER_CARDS: Record<PlayerClass, { attack: string; defend: string; signature: string }> = {
  warrior: { attack: 'w_strike',  defend: 'w_defend',  signature: 'w_bash' },
  mage:    { attack: 'm_spark',   defend: 'm_ward',    signature: 'm_arcane_missile' },
  rogue:   { attack: 'r_stab',    defend: 'r_dodge',   signature: 'r_backstab' },
};

export function getStarterDeck(playerClass: PlayerClass): string[] {
  const s = STARTER_CARDS[playerClass];
  return [...Array(5).fill(s.attack), ...Array(4).fill(s.defend), s.signature];
}

export function getRewardPool(playerClass: PlayerClass, monsterType: 'small' | 'rare'): CardDefinition[] {
  const starter = STARTER_CARDS[playerClass];
  const starterIds = new Set([starter.attack, starter.defend, starter.signature]);
  const classCards = ALL_CARDS.filter(c => c.class === playerClass && !c.upgraded);
  if (monsterType === 'small') {
    return classCards.filter(c => (c.tier === 'basic' && !starterIds.has(c.id)) || c.tier === 'common');
  } else {
    return classCards.filter(c => c.tier === 'powerful');
  }
}

export { ALL_CARDS };
