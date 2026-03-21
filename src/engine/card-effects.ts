import type { CardDefinition, BuffType } from '@shared/cards/types';
import { drawCards, type DeckState } from './deck';

// ---------------------------------------------------------------------------
// CombatantState — local type for combat logic.
// Covers the fields needed from both Player and MonsterState.
// Task 12 (combat engine) will handle converting Player/Monster to this format.
// ---------------------------------------------------------------------------

export interface CombatantState {
  hp: number;
  maxHp: number;
  block: number;
  buffs: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DamageResult {
  attacker: CombatantState;
  defender: CombatantState;
}

export interface CardEffectsResult {
  attacker: CombatantState;
  defender: CombatantState;
  deck: DeckState;
}

// ---------------------------------------------------------------------------
// applyDamage
//
// Calculates final damage factoring in:
//   - attacker's strength (flat bonus)
//   - attacker's weak debuff (−25%, floored)
//   - defender's vulnerable debuff (+50%, floored)
// Then subtracts from defender's block first; remainder hits HP (min 0).
// ---------------------------------------------------------------------------

export function applyDamage(
  baseValue: number,
  attacker: CombatantState,
  defender: CombatantState,
): DamageResult {
  const strength = attacker.buffs['strength'] ?? 0;
  const isWeak = (attacker.buffs['weak'] ?? 0) > 0;
  const isVulnerable = (defender.buffs['vulnerable'] ?? 0) > 0;

  let damage = baseValue + strength;
  if (isWeak) damage = Math.floor(damage * 0.75);
  if (isVulnerable) damage = Math.floor(damage * 1.5);

  const newBlock = Math.max(0, defender.block - damage);
  const damageToHp = Math.max(0, damage - defender.block);
  const newHp = Math.max(0, defender.hp - damageToHp);

  return {
    attacker,
    defender: { ...defender, hp: newHp, block: newBlock },
  };
}

// ---------------------------------------------------------------------------
// applyBlock — adds block value to target (pure)
// ---------------------------------------------------------------------------

export function applyBlock(value: number, target: CombatantState): CombatantState {
  return { ...target, block: target.block + value };
}

// ---------------------------------------------------------------------------
// applyBuff — adds/stacks a named buff on target (pure)
// ---------------------------------------------------------------------------

export function applyBuff(
  target: CombatantState,
  buff: BuffType | string,
  value: number,
): CombatantState {
  const current = target.buffs[buff] ?? 0;
  return {
    ...target,
    buffs: { ...target.buffs, [buff]: current + value },
  };
}

// ---------------------------------------------------------------------------
// applyHeal — restores HP, capped at maxHp (pure)
// ---------------------------------------------------------------------------

export function applyHeal(value: number, target: CombatantState): CombatantState {
  return { ...target, hp: Math.min(target.maxHp, target.hp + value) };
}

// ---------------------------------------------------------------------------
// tickPoison — deal poison stacks as damage (bypasses block), reduce by 1
// ---------------------------------------------------------------------------

export function tickPoison(target: CombatantState): CombatantState {
  const stacks = target.buffs['poison'] ?? 0;
  if (stacks <= 0) return target;

  const newHp = Math.max(0, target.hp - stacks);
  const newBuffs = { ...target.buffs };
  if (stacks - 1 <= 0) {
    delete newBuffs['poison'];
  } else {
    newBuffs['poison'] = stacks - 1;
  }
  return { ...target, hp: newHp, buffs: newBuffs };
}

// ---------------------------------------------------------------------------
// tickBurn — deal burn stacks as damage (bypasses block), reduce by 1
// ---------------------------------------------------------------------------

export function tickBurn(target: CombatantState): CombatantState {
  const stacks = target.buffs['burn'] ?? 0;
  if (stacks <= 0) return target;

  const newHp = Math.max(0, target.hp - stacks);
  const newBuffs = { ...target.buffs };
  if (stacks - 1 <= 0) {
    delete newBuffs['burn'];
  } else {
    newBuffs['burn'] = stacks - 1;
  }
  return { ...target, hp: newHp, buffs: newBuffs };
}

// ---------------------------------------------------------------------------
// resetBlock — set block to 0 at the start of a turn.
// Exception: barricade buff preserves block.
// ---------------------------------------------------------------------------

export function resetBlock(target: CombatantState): CombatantState {
  if ((target.buffs['barricade'] ?? 0) > 0) return target;
  return { ...target, block: 0 };
}

// ---------------------------------------------------------------------------
// resolveCardEffects — process each effect in a card's effects array.
// Returns new attacker, defender, and deck states. All inputs are treated
// as immutable.
// ---------------------------------------------------------------------------

export function resolveCardEffects(
  card: CardDefinition,
  attacker: CombatantState,
  defender: CombatantState,
  deck: DeckState,
): CardEffectsResult {
  let att = { ...attacker, buffs: { ...attacker.buffs } };
  let def = { ...defender, buffs: { ...defender.buffs } };
  let dk = deck;

  for (const effect of card.effects) {
    switch (effect.type) {
      case 'damage': {
        const res = applyDamage(effect.value, att, def);
        att = res.attacker;
        def = res.defender;
        break;
      }
      case 'block': {
        // target defaults to 'self'
        const tgt = effect.target ?? 'self';
        if (tgt === 'self') {
          att = applyBlock(effect.value, att);
        } else {
          def = applyBlock(effect.value, def);
        }
        break;
      }
      case 'buff': {
        if (effect.buff === undefined) {
          throw new Error(`buff effect on card "${card.id}" is missing the required 'buff' field`);
        }
        const buffName = effect.buff;
        const tgt = effect.target ?? 'self';
        if (tgt === 'self') {
          att = applyBuff(att, buffName, effect.value);
        } else {
          def = applyBuff(def, buffName, effect.value);
        }
        break;
      }
      case 'debuff': {
        if (effect.buff === undefined) {
          throw new Error(`debuff effect on card "${card.id}" is missing the required 'buff' field`);
        }
        const buffName = effect.buff;
        const tgt = effect.target ?? 'enemy';
        if (tgt === 'enemy') {
          def = applyBuff(def, buffName, effect.value);
        } else {
          att = applyBuff(att, buffName, effect.value);
        }
        break;
      }
      case 'draw': {
        dk = drawCards(dk, effect.value);
        break;
      }
      case 'heal': {
        const tgt = effect.target ?? 'self';
        if (tgt === 'self') {
          att = applyHeal(effect.value, att);
        } else {
          def = applyHeal(effect.value, def);
        }
        break;
      }
      case 'poison': {
        const tgt = effect.target ?? 'enemy';
        if (tgt === 'enemy') {
          def = applyBuff(def, 'poison', effect.value);
        } else {
          att = applyBuff(att, 'poison', effect.value);
        }
        break;
      }
      case 'burn': {
        const tgt = effect.target ?? 'enemy';
        if (tgt === 'enemy') {
          def = applyBuff(def, 'burn', effect.value);
        } else {
          att = applyBuff(att, 'burn', effect.value);
        }
        break;
      }
      case 'aoe_damage': {
        // AOE targets all enemies — in the single-target context here we apply
        // it to the defender. The combat engine (Task 12) will fan this out.
        const res = applyDamage(effect.value, att, def);
        att = res.attacker;
        def = res.defender;
        break;
      }
      case 'energy': {
        // Energy management is handled by the combat engine; no state change here.
        break;
      }
      default:
        break;
    }
  }

  return { attacker: att, defender: def, deck: dk };
}
