import type { CardType, PlayerClass } from '../types';

export type EffectType =
  | 'damage'
  | 'block'
  | 'buff'
  | 'debuff'
  | 'draw'
  | 'heal'
  | 'energy'
  | 'poison'
  | 'burn'
  | 'aoe_damage';

export type BuffType =
  | 'strength'
  | 'vulnerable'
  | 'weak'
  | 'thorns'
  | 'rage'
  | 'combo'
  | 'frozen'
  | 'barricade';

export interface CardEffect {
  type: EffectType;
  value: number;
  target?: 'self' | 'enemy';
  buff?: BuffType;
  condition?: 'per_combo' | 'per_missing_hp' | 'per_poison';
}

export interface CardDefinition {
  id: string;
  name: string;
  class: PlayerClass;
  type: CardType;
  cost: number;
  effects: CardEffect[];
  description: string;
  upgraded: boolean;
  upgradeId?: string;
  archetype?: string;
  tier: 'basic' | 'common' | 'powerful';
}
