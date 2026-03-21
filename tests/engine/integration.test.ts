import { describe, it, expect } from 'vitest';
import type { Player, MonsterState, CombatState } from '@shared/types';

// Cards & Deck
import { getStarterDeck, getCardById, getRewardPool } from '@shared/cards';
import { createDeck, drawCards, discardHand } from '@engine/deck';

// Combat
import {
  createPvECombat,
  createPvPCombat,
  startTurn,
  playCard,
  endTurn,
  checkCombatEnd,
  getEnergyForTurn,
} from '@engine/combat';

// Monsters
import { MONSTERS, createMonsterState, getRandomMonster } from '@engine/monsters';

// Map
import { generateMap, placeEvents, getSpawnPoints } from '@engine/map-generator';

// Events
import { resolveCampfire } from '@engine/events';

// Event alternation
import { canUseNonFightEvent, recordNonFightEvent, recordFightEvent } from '@engine/event-alternation';

// Constants
import {
  STARTING_HP,
  MAX_HP_CAP,
  STARTING_ENERGY,
  ENERGY_PER_TURN,
  CARDS_PER_DRAW,
  PVP_DAMAGE_CAP,
  PVP_MAX_ROUNDS,
  FLEE_HP_COST,
  FREE_NON_FIGHT_EVENTS,
} from '@shared/constants';

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makePlayer(id: string, playerClass: 'warrior' | 'mage' | 'rogue'): Player {
  const deck = getStarterDeck(playerClass);
  return {
    id,
    name: `Player_${id}`,
    class: playerClass,
    hp: STARTING_HP,
    maxHp: STARTING_HP,
    position: { x: 0, y: 0 },
    deck: [...deck],
    hand: [],
    drawPile: [...deck],
    discardPile: [],
    block: 0,
    isAlive: true,
    freeNonFightEvents: FREE_NON_FIGHT_EVENTS,
    needsFight: false,
    pvpCooldowns: {},
    stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
  };
}

// ---------------------------------------------------------------------------
// Integration: Full mini-game flow
// ---------------------------------------------------------------------------

describe('integration: full mini-game flow', () => {
  // =========================================================================
  // Step 1: Create a player with a starter deck
  // =========================================================================
  it('step 1 — create a player with starter deck', () => {
    const player = makePlayer('hero', 'warrior');
    expect(player.hp).toBe(STARTING_HP);
    expect(player.deck).toHaveLength(10); // 5 strikes + 4 defends + 1 bash
    expect(player.drawPile).toHaveLength(10);
    expect(player.hand).toHaveLength(0);
    expect(player.isAlive).toBe(true);
  });

  // =========================================================================
  // Step 2: Generate a map with events
  // =========================================================================
  it('step 2 — generate a map with events', () => {
    const map = generateMap(60, 60, 42);
    expect(map.width).toBe(60);
    expect(map.height).toBe(60);

    const events = placeEvents(map, 4);
    expect(events.length).toBeGreaterThan(0);
    // Every event should be on a walkable tile
    for (const ev of events) {
      expect(map.tiles[ev.position.y][ev.position.x].walkable).toBe(true);
    }

    const spawns = getSpawnPoints(map, 4, events);
    expect(spawns).toHaveLength(4);
  });

  // =========================================================================
  // Steps 3-5: PvE combat — fight a small monster, kill it, pick a reward
  // =========================================================================
  it('steps 3-5 — PvE combat: fight small monster, kill it, pick reward', () => {
    let player = makePlayer('hero', 'warrior');

    // Create a small goblin with low HP so the fight can end quickly
    const goblinDef = MONSTERS.find(m => m.id === 'goblin')!;
    const monster: MonsterState = {
      id: goblinDef.id,
      name: goblinDef.name,
      hp: 15,       // low HP to keep the test short
      maxHp: 15,
      block: 0,
      patternIndex: 0,
      buffs: {},
    };

    let combat = createPvECombat('hero', monster);
    expect(combat.type).toBe('pve');
    expect(combat.isComplete).toBe(false);

    // Play through combat turns until monster dies or safety limit
    let currentMonster = combat.monster!;
    let buffs: Record<string, number> = {};
    const MAX_TURNS = 10;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      // Start turn
      const st = startTurn(combat, player, buffs);
      combat = st.combat;
      player = st.player;
      let energy = st.energy;
      buffs = st.buffs;

      // Play as many cards as we can from hand
      for (const cardId of [...player.hand]) {
        const card = getCardById(cardId);
        if (!card || energy < card.cost) continue;

        // For attack cards, target the monster; for skill cards, also target monster
        const result = playCard(combat, player, cardId, energy, currentMonster, buffs, {});
        if ('error' in result) continue;

        combat = result.combat;
        player = result.player;
        currentMonster = result.target as MonsterState;
        energy = result.energy;
        buffs = result.playerBuffs;

        // Check if monster died
        const endCheck = checkCombatEnd(combat, [player], currentMonster);
        if (endCheck.isComplete) {
          combat = endCheck;
          break;
        }
      }

      if (combat.isComplete) break;

      // End turn (monster acts)
      const et = endTurn(combat, player, undefined, buffs);
      combat = et.combat;
      player = et.player;
      buffs = et.playerBuffs ?? {};
      currentMonster = combat.monster!;

      // Check combat end after monster acts
      const endCheck = checkCombatEnd(combat, [player], currentMonster);
      if (endCheck.isComplete) {
        combat = endCheck;
        break;
      }
    }

    // The monster should be dead (HP 15 vs warrior doing 6 per strike)
    expect(combat.isComplete).toBe(true);
    expect(currentMonster.hp).toBeLessThanOrEqual(0);
    expect(player.isAlive).toBe(true);

    // Pick a reward card (step 5)
    const rewards = getRewardPool('warrior', 'small');
    expect(rewards.length).toBeGreaterThan(0);

    // Simulate picking the first reward card
    const chosenCard = rewards[0];
    player = {
      ...player,
      deck: [...player.deck, chosenCard.id],
      stats: { ...player.stats, monstersKilled: player.stats.monstersKilled + 1 },
    };
    expect(player.deck).toHaveLength(11); // original 10 + 1 reward
    expect(player.stats.monstersKilled).toBe(1);
  });

  // =========================================================================
  // Step 6: Campfire heal
  // =========================================================================
  it('step 6 — player walks to campfire and heals', () => {
    // Player took some damage from the goblin fight
    let player = makePlayer('hero', 'warrior');
    player = { ...player, hp: 70 };

    const result = resolveCampfire(player);
    expect(result.player.hp).toBeGreaterThan(70);
    expect(result.player.hp).toBeLessThanOrEqual(player.maxHp);
    expect(result.message).toBeTruthy();
  });

  // =========================================================================
  // Step 7: Event alternation tracking
  // =========================================================================
  it('step 7 — event alternation is tracked', () => {
    let player = makePlayer('hero', 'warrior');

    // Player starts with 3 free non-fight events
    expect(player.freeNonFightEvents).toBe(FREE_NON_FIGHT_EVENTS);
    expect(canUseNonFightEvent(player)).toBe(true);

    // Use 3 non-fight events (campfire, blacksmith, random)
    player = recordNonFightEvent(player); // 2 remaining
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 1 remaining
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 0 remaining, needsFight = true
    expect(canUseNonFightEvent(player)).toBe(false);
    expect(player.needsFight).toBe(true);

    // After a fight, non-fight events unlock again
    player = recordFightEvent(player);
    expect(canUseNonFightEvent(player)).toBe(true);
    expect(player.needsFight).toBe(false);

    // One more non-fight event locks it again
    player = recordNonFightEvent(player);
    expect(canUseNonFightEvent(player)).toBe(false);
    expect(player.needsFight).toBe(true);
  });

  // =========================================================================
  // Steps 8-10: PvP combat — 4 rounds, damage cap enforced
  // =========================================================================
  it('steps 8-10 — PvP combat: 4 rounds, damage cap enforced', () => {
    let player1 = makePlayer('p1', 'warrior');
    let player2 = makePlayer('p2', 'mage');

    let combat = createPvPCombat('p1', 'p2', 'p1');
    expect(combat.type).toBe('pvp');
    expect(combat.maxRounds).toBe(PVP_MAX_ROUNDS);
    expect(combat.damageCap).toBe(PVP_DAMAGE_CAP);
    expect(combat.playerIds[combat.activePlayerIndex]).toBe('p1');

    let p1Buffs: Record<string, number> = {};
    let p2Buffs: Record<string, number> = {};

    // Play through 4 rounds (each round = p1 turn + p2 turn)
    for (let round = 1; round <= PVP_MAX_ROUNDS; round++) {
      // Check combat hasn't ended early
      combat = checkCombatEnd(combat, [player1, player2]);
      if (combat.isComplete) break;

      // --- Player 1's turn ---
      expect(combat.playerIds[combat.activePlayerIndex]).toBe('p1');
      const st1 = startTurn(combat, player1, p1Buffs);
      combat = st1.combat;
      player1 = st1.player;
      let energy1 = st1.energy;
      p1Buffs = st1.buffs;

      // Play up to 2 cards to keep the test straightforward
      let cardsPlayed = 0;
      for (const cardId of [...player1.hand]) {
        if (cardsPlayed >= 2) break;
        const card = getCardById(cardId);
        if (!card || energy1 < card.cost) continue;

        const result = playCard(combat, player1, cardId, energy1, player2, p1Buffs, p2Buffs);
        if ('error' in result) continue;

        combat = result.combat;
        player1 = result.player;
        player2 = result.target as Player;
        energy1 = result.energy;
        p1Buffs = result.playerBuffs;
        p2Buffs = result.targetBuffs;
        cardsPlayed++;
      }

      // Check damage cap after p1's actions
      combat = checkCombatEnd(combat, [player1, player2]);
      if (combat.isComplete) break;

      // End p1's turn
      const et1 = endTurn(combat, player1, player2, p1Buffs, p2Buffs);
      combat = et1.combat;
      player1 = et1.player;
      player2 = et1.target ?? player2;
      p1Buffs = et1.playerBuffs ?? {};
      p2Buffs = et1.targetBuffs ?? {};

      // After p1 ends, p2 should be active
      expect(combat.playerIds[combat.activePlayerIndex]).toBe('p2');

      combat = checkCombatEnd(combat, [player1, player2]);
      if (combat.isComplete) break;

      // --- Player 2's turn ---
      const st2 = startTurn(combat, player2, p2Buffs);
      combat = st2.combat;
      player2 = st2.player;
      let energy2 = st2.energy;
      p2Buffs = st2.buffs;

      // Play up to 2 cards
      cardsPlayed = 0;
      for (const cardId of [...player2.hand]) {
        if (cardsPlayed >= 2) break;
        const card = getCardById(cardId);
        if (!card || energy2 < card.cost) continue;

        const result = playCard(combat, player2, cardId, energy2, player1, p2Buffs, p1Buffs);
        if ('error' in result) continue;

        combat = result.combat;
        player2 = result.player;
        player1 = result.target as Player;
        energy2 = result.energy;
        p2Buffs = result.playerBuffs;
        p1Buffs = result.targetBuffs;
        cardsPlayed++;
      }

      // Check damage cap after p2's actions
      combat = checkCombatEnd(combat, [player1, player2]);
      if (combat.isComplete) break;

      // End p2's turn
      const et2 = endTurn(combat, player2, player1, p2Buffs, p1Buffs);
      combat = et2.combat;
      player2 = et2.player;
      player1 = et2.target ?? player1;
      p2Buffs = et2.playerBuffs ?? {};
      p1Buffs = et2.targetBuffs ?? {};

      // After both players act, round increments
      // (round n just completed, combat.round is now n+1)
      if (!combat.isComplete) {
        expect(combat.round).toBe(round + 1);
      }

      combat = checkCombatEnd(combat, [player1, player2]);
      if (combat.isComplete) break;
    }

    // After 4 rounds (combat.round would be 5 after round 4 ends), combat should end
    combat = checkCombatEnd(combat, [player1, player2]);
    expect(combat.isComplete).toBe(true);

    // Verify damage tracker exists and tracks per-player damage
    expect(combat.damageTracker).toBeDefined();
    expect(typeof combat.damageTracker['p1']).toBe('number');
    expect(typeof combat.damageTracker['p2']).toBe('number');
  });

  // =========================================================================
  // Damage cap enforcement (explicit test)
  // =========================================================================
  it('step 10 — PvP damage cap is enforced', () => {
    const combat = createPvPCombat('p1', 'p2', 'p1');
    const players = [makePlayer('p1', 'warrior'), makePlayer('p2', 'mage')];

    // Manually set damage tracker to the cap
    const cappedCombat: CombatState = {
      ...combat,
      damageTracker: { p1: PVP_DAMAGE_CAP, p2: 5 },
    };

    const result = checkCombatEnd(cappedCombat, players);
    expect(result.isComplete).toBe(true);
  });

  it('step 10 — PvP damage below cap does not end combat', () => {
    const combat = createPvPCombat('p1', 'p2', 'p1');
    const players = [makePlayer('p1', 'warrior'), makePlayer('p2', 'mage')];

    const underCapCombat: CombatState = {
      ...combat,
      damageTracker: { p1: PVP_DAMAGE_CAP - 1, p2: 0 },
    };

    const result = checkCombatEnd(underCapCombat, players);
    expect(result.isComplete).toBe(false);
  });
});
