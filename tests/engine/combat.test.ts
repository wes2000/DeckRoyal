import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPvECombat,
  createPvPCombat,
  getEnergyForTurn,
  startTurn,
  playCard,
  endTurn,
  fleePvE,
  checkCombatEnd,
} from '@engine/combat';
import type { Player, MonsterState, CombatState } from '@shared/types';
import { STARTING_ENERGY, ENERGY_PER_TURN, CARDS_PER_DRAW, PVP_DAMAGE_CAP, PVP_MAX_ROUNDS, FLEE_HP_COST, TURN_TIMER_SECONDS } from '@shared/constants';

// ---------------------------------------------------------------------------
// Helpers to build test fixtures
// ---------------------------------------------------------------------------

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1',
    name: 'TestPlayer',
    class: 'warrior',
    hp: 100,
    maxHp: 100,
    position: { x: 0, y: 0 },
    deck: ['w_strike', 'w_strike', 'w_strike', 'w_strike', 'w_strike', 'w_defend', 'w_defend', 'w_defend', 'w_defend', 'w_bash'],
    hand: [],
    drawPile: ['w_strike', 'w_strike', 'w_strike', 'w_strike', 'w_strike', 'w_defend', 'w_defend', 'w_defend', 'w_defend', 'w_bash'],
    discardPile: [],
    block: 0,
    isAlive: true,
    freeNonFightEvents: 3,
    needsFight: false,
    pvpCooldowns: {},
    stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    ...overrides,
  };
}

function makeMonster(overrides: Partial<MonsterState> = {}): MonsterState {
  return {
    id: 'goblin',
    name: 'Goblin',
    hp: 30,
    maxHp: 30,
    block: 0,
    patternIndex: 0,
    buffs: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('combat engine', () => {
  describe('createPvECombat', () => {
    it('initializes combat state correctly', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);

      expect(combat.type).toBe('pve');
      expect(combat.playerIds).toEqual(['p1']);
      expect(combat.activePlayerIndex).toBe(0);
      expect(combat.turnCounters['p1']).toBe(0);
      expect(combat.round).toBe(1);
      expect(combat.monster).toBeDefined();
      expect(combat.monster!.id).toBe('goblin');
      expect(combat.isComplete).toBe(false);
      expect(combat.damageCap).toBe(0); // no cap for PvE
      expect(combat.maxRounds).toBe(0); // no max rounds for PvE
    });
  });

  describe('createPvPCombat', () => {
    it('initializes with 4 max rounds, 20 damage cap', () => {
      const combat = createPvPCombat('p1', 'p2', 'p1');

      expect(combat.type).toBe('pvp');
      expect(combat.playerIds).toContain('p1');
      expect(combat.playerIds).toContain('p2');
      expect(combat.maxRounds).toBe(PVP_MAX_ROUNDS);
      expect(combat.damageCap).toBe(PVP_DAMAGE_CAP);
      expect(combat.damageTracker['p1']).toBe(0);
      expect(combat.damageTracker['p2']).toBe(0);
      expect(combat.turnCounters['p1']).toBe(0);
      expect(combat.turnCounters['p2']).toBe(0);
      expect(combat.isComplete).toBe(false);
      // Initiator goes first
      expect(combat.playerIds[combat.activePlayerIndex]).toBe('p1');
    });
  });

  describe('getEnergyForTurn', () => {
    it('returns STARTING_ENERGY for turn 1', () => {
      expect(getEnergyForTurn(1)).toBe(STARTING_ENERGY);
    });

    it('scales energy: turn 1 = 2, turn 2 = 3, turn 3 = 4', () => {
      expect(getEnergyForTurn(1)).toBe(2);
      expect(getEnergyForTurn(2)).toBe(3);
      expect(getEnergyForTurn(3)).toBe(4);
    });
  });

  describe('startTurn', () => {
    it('resets block, draws 5 cards, sets energy to turnNumber + 1', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);
      const player = makePlayer({ block: 10 });

      const result = startTurn(combat, player);

      // Block should be reset to 0
      expect(result.player.block).toBe(0);
      // Should draw CARDS_PER_DRAW cards
      expect(result.player.hand).toHaveLength(CARDS_PER_DRAW);
      // Turn counter should be incremented
      expect(result.combat.turnCounters['p1']).toBe(1);
      // Energy should be set for turn 1
      expect(result.energy).toBe(STARTING_ENERGY);
    });

    it('increments turn counter on subsequent calls', () => {
      const monster = makeMonster();
      let combat = createPvECombat('p1', monster);
      const player = makePlayer();

      const r1 = startTurn(combat, player);
      expect(r1.combat.turnCounters['p1']).toBe(1);
      expect(r1.energy).toBe(2);

      // Simulate end turn + second start
      const endResult = endTurn(r1.combat, r1.player);
      const r2 = startTurn(endResult.combat, endResult.player);
      expect(r2.combat.turnCounters['p1']).toBe(2);
      expect(r2.energy).toBe(3);
    });
  });

  describe('playCard', () => {
    it('deducts energy, resolves effects, discards card', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);
      // Use a controlled hand with no duplicates to avoid draw-pile confusion
      const player = makePlayer({
        hand: [],
        drawPile: ['w_strike', 'w_defend', 'w_bash', 'w_defend', 'w_defend'],
        discardPile: [],
      });

      const startResult = startTurn(combat, player);
      const handBefore = startResult.player.hand.length;
      // w_strike costs 1 energy, deals 6 damage
      const result = playCard(startResult.combat, startResult.player, 'w_strike', startResult.energy, monster);

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        // Energy deducted
        expect(result.energy).toBe(startResult.energy - 1);
        // Hand size decreased by 1 (card discarded)
        expect(result.player.hand).toHaveLength(handBefore - 1);
        // Card should be in discard pile
        expect(result.player.discardPile).toContain('w_strike');
        // Monster took damage: w_strike deals 6 to goblin's 30hp
        expect(result.target.hp).toBe(24);
      }
    });

    it('fails if not enough energy', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);
      const player = makePlayer({ hand: ['w_bash'] }); // w_bash costs 2

      const startResult = startTurn(combat, player);
      // Try to play w_bash with only 1 energy
      const result = playCard(startResult.combat, startResult.player, 'w_bash', 1, monster);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('energy');
      }
    });

    it('fails if not player\'s turn', () => {
      const combat = createPvPCombat('p1', 'p2', 'p1');
      // p1 is active, p2 tries to play
      const player2 = makePlayer({ id: 'p2', hand: ['w_strike'] });
      const player1 = makePlayer({ id: 'p1' });

      const result = playCard(combat, player2, 'w_strike', 2, player1);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('turn');
      }
    });
  });

  describe('endTurn', () => {
    it('discards hand, advances to next turn', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);
      const player = makePlayer({ hand: ['w_strike', 'w_defend'] });

      const startResult = startTurn(combat, player);
      const result = endTurn(startResult.combat, startResult.player);

      // Hand should be empty
      expect(result.player.hand).toHaveLength(0);
      // Discards should include the hand cards
      expect(result.player.discardPile.length).toBeGreaterThan(0);
    });
  });

  describe('PvE monster actions', () => {
    it('monster acts after player ends turn', () => {
      const monster = makeMonster(); // goblin pattern[0] = attack 6
      const combat = createPvECombat('p1', monster);
      const player = makePlayer();

      const startResult = startTurn(combat, player);
      const endResult = endTurn(startResult.combat, startResult.player);

      // After end turn in PvE, monster should have acted
      // Goblin pattern[0] = attack 6, player has no block from startTurn (block reset)
      // Player should have taken 6 damage
      expect(endResult.player.hp).toBe(94);
      // Monster's pattern should advance
      expect(endResult.combat.monster!.patternIndex).toBe(1);
    });
  });

  describe('PvP combat', () => {
    it('alternates between players, increments round after both act', () => {
      const combat = createPvPCombat('p1', 'p2', 'p1');

      // p1 is active first
      expect(combat.playerIds[combat.activePlayerIndex]).toBe('p1');
      expect(combat.round).toBe(1);

      const p1 = makePlayer({ id: 'p1' });
      const p2 = makePlayer({ id: 'p2' });

      // p1 starts and ends turn
      const s1 = startTurn(combat, p1);
      const e1 = endTurn(s1.combat, s1.player, p2);

      // Now p2 should be active
      expect(e1.combat.playerIds[e1.combat.activePlayerIndex]).toBe('p2');
      expect(e1.combat.round).toBe(1); // round hasn't incremented yet

      // p2 starts and ends turn
      const s2 = startTurn(e1.combat, e1.target!);
      const e2 = endTurn(s2.combat, s2.player, e1.player);

      // After both players acted, round should increment
      expect(e2.combat.round).toBe(2);
      // p1 should be active again
      expect(e2.combat.playerIds[e2.combat.activePlayerIndex]).toBe('p1');
    });

    it('ends when damage cap reached', () => {
      const combat = createPvPCombat('p1', 'p2', 'p1');
      const players = [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2', hp: 15 })];

      // Manually set damage tracker to near cap
      const modCombat: CombatState = {
        ...combat,
        damageTracker: { p1: 0, p2: PVP_DAMAGE_CAP },
      };

      const result = checkCombatEnd(modCombat, players);
      expect(result.isComplete).toBe(true);
    });

    it('ends after 4 rounds', () => {
      const combat = createPvPCombat('p1', 'p2', 'p1');
      const players = [makePlayer({ id: 'p1' }), makePlayer({ id: 'p2' })];

      // Set round past max
      const modCombat: CombatState = {
        ...combat,
        round: PVP_MAX_ROUNDS + 1,
      };

      const result = checkCombatEnd(modCombat, players);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('fleePvE', () => {
    it('costs 10 HP', () => {
      const monster = makeMonster();
      let combat = createPvECombat('p1', monster);
      // Set turn counter to 2 so flee is allowed
      combat = { ...combat, turnCounters: { p1: 2 } };
      const player = makePlayer({ hp: 50 });

      const result = fleePvE(combat, player);

      expect('error' in result).toBe(false);
      if (!('error' in result)) {
        expect(result.player.hp).toBe(50 - FLEE_HP_COST);
        expect(result.combat.isComplete).toBe(true);
      }
    });

    it('not available turn 1', () => {
      const monster = makeMonster();
      let combat = createPvECombat('p1', monster);
      // Turn counter is 1 (first turn)
      combat = { ...combat, turnCounters: { p1: 1 } };
      const player = makePlayer();

      const result = fleePvE(combat, player);

      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain('turn 1');
      }
    });
  });

  describe('player death', () => {
    it('sets isComplete when player dies during combat', () => {
      const monster = makeMonster();
      const combat = createPvECombat('p1', monster);
      const players = [makePlayer({ id: 'p1', hp: 0, isAlive: false })];

      const result = checkCombatEnd(combat, players, monster);
      expect(result.isComplete).toBe(true);
    });
  });

  describe('monster death', () => {
    it('sets isComplete when monster dies', () => {
      const monster = makeMonster({ hp: 0 });
      const combat = createPvECombat('p1', monster);
      const players = [makePlayer({ id: 'p1' })];

      const result = checkCombatEnd(combat, players, monster);
      expect(result.isComplete).toBe(true);
    });
  });
});
