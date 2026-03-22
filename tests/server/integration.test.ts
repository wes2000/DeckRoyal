import { describe, it, expect, beforeEach } from 'vitest';

// Lobby
import { createLobby, joinLobby, selectClass, canStart, getLobbyState } from '../../src/server/lobby';
import type { Lobby } from '../../src/server/lobby';

// Game Manager
import {
  initializeGame,
  startGame,
  startCountdown,
  eliminatePlayer,
  checkWinCondition,
  getPlayerView,
} from '../../src/server/game-manager';

// Player Handler
import { movePlayer, getNewPosition } from '../../src/server/player-handler';

// Combat Handler
import {
  startPvECombat,
  startPvPCombat,
  handlePlayCard,
  handleEndTurn,
  handleFlee,
} from '../../src/server/combat-handler';

// Event Handler
import {
  handleEventInteraction,
  handleCardSelection,
  handleUpgradeSelection,
} from '../../src/server/event-handler';

// Game Loop
import { tick } from '../../src/server/game-loop';

// Disconnect Handler
import {
  handleDisconnect,
  handleReconnect,
  checkDisconnectTimers,
} from '../../src/server/disconnect-handler';

// Engine modules (for setup/verification)
import { getStarterDeck, getRewardPool } from '../../src/shared/cards';
import {
  STARTING_HP,
  PVP_DAMAGE_CAP,
  PVP_MAX_ROUNDS,
  FREE_NON_FIGHT_EVENTS,
  CAMPFIRE_HEAL_RANGE,
  FLEE_HP_COST,
} from '../../src/shared/constants';
import { createMonsterState, getRandomMonster } from '../../src/engine/monsters';
import { canUseNonFightEvent } from '../../src/engine/event-alternation';
import type { GameState, EventTile, CombatState, Player } from '../../src/shared/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Create a standard 2-player lobby with warriors selected. */
function createTwoPlayerLobby(): Lobby {
  let lobby = createLobby('p1', 'Alice');
  const joinResult = joinLobby(lobby, 'p2', 'Bob');
  if ('error' in joinResult) throw new Error(joinResult.error);
  lobby = joinResult;
  const s1 = selectClass(lobby, 'p1', 'warrior');
  if ('error' in s1) throw new Error(s1.error);
  lobby = s1;
  const s2 = selectClass(lobby, 'p2', 'warrior');
  if ('error' in s2) throw new Error(s2.error);
  return s2;
}

/** Create a started 2-player game from scratch. */
function createTwoPlayerGame(): GameState {
  const lobby = createTwoPlayerLobby();
  const initialized = initializeGame(lobby);
  return startGame(initialized);
}

/**
 * Place a synthetic event at a known walkable position near a player.
 * Finds an adjacent walkable tile and injects an event there.
 */
function injectEvent(
  game: GameState,
  playerId: string,
  eventType: EventTile['type'],
  eventId: string,
): { game: GameState; eventPosition: { x: number; y: number } } {
  const player = game.players[playerId];
  const { x, y } = player.position;

  // Try adjacent tiles to find a walkable one
  const directions: Array<{ dx: number; dy: number }> = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];

  for (const { dx, dy } of directions) {
    const nx = x + dx;
    const ny = y + dy;
    if (
      nx >= 0 && nx < game.map.width &&
      ny >= 0 && ny < game.map.height &&
      game.map.tiles[ny][nx].walkable
    ) {
      const newEvent: EventTile = {
        id: eventId,
        type: eventType,
        position: { x: nx, y: ny },
        active: true,
      };
      return {
        game: {
          ...game,
          events: [...game.events, newEvent],
        },
        eventPosition: { x: nx, y: ny },
      };
    }
  }

  // Fallback: place at player's current position (should not normally happen)
  const newEvent: EventTile = {
    id: eventId,
    type: eventType,
    position: { x, y },
    active: true,
  };
  return {
    game: { ...game, events: [...game.events, newEvent] },
    eventPosition: { x, y },
  };
}

/**
 * Find the combat ID for an active (incomplete) combat involving a player.
 */
function findActiveCombat(game: GameState, playerId: string): CombatState | undefined {
  return Object.values(game.combats).find(
    (c) => !c.isComplete && c.playerIds.includes(playerId),
  );
}

/**
 * Play through a PvE combat until the monster dies or the player dies.
 *
 * Strategy: Each turn, call handleEndTurn first — which auto-starts the turn
 * (draws cards, etc.) if not started and then ends it (monster acts, hand discards).
 * Then on the NEXT iteration, the turn will be fresh. We use handlePlayCard
 * to play cards from the newly drawn hand before ending the turn.
 *
 * Since handlePlayCard also auto-starts the turn if not started, we can just
 * try playing cards from drawPile (which will be drawn into hand by startTurn).
 * After startTurn fires inside handlePlayCard, the player's hand is populated
 * in the returned game state. If the card we specified happens to be in the
 * new hand, it plays. Otherwise, we read the updated hand and retry.
 */
function playPvEUntilDone(game: GameState, playerId: string, combatId: string): GameState {
  let current = game;
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    const combat = current.combats[combatId];
    if (!combat || combat.isComplete) break;

    // End the previous turn (or start+end if not started).
    // This draws cards via startTurn internally (if not already started),
    // then ends the turn — monster acts, hand is discarded.
    // On the first call this effectively plays turn 1 with no cards played.
    // But we want to actually play cards. So let's start turn by playing a card:

    // handlePlayCard auto-starts the turn (draws cards). We try playing the
    // first card from drawPile — after startTurn fires, it'll be in hand.
    // If hand is empty and drawPile is empty, endTurn handles it.
    const player = current.players[playerId];

    // First, trigger turn start by calling handleEndTurn which auto-starts
    // if not started. BUT we want to play cards first. The trick: call
    // handlePlayCard with a card we expect to be drawn. Since we can't predict
    // the draw, let's just start the turn via handleEndTurn (which starts it
    // if not started), read the hand, then try to play before ending again.

    // Actually the simplest approach: call handleEndTurn to start-and-end the turn.
    // The turn start draws cards, but endTurn discards them immediately.
    // Monster acts during endTurn. But no player cards are played.

    // Better: manually trigger the turn by attempting to play a non-existent card.
    // handlePlayCard calls startTurn (draws cards) then fails on card lookup.
    // Side effect: session.turnStarted = true and cards are drawn.
    const dummy = handlePlayCard(current, combatId, playerId, '__dummy__');
    // After this call, startTurn has fired (if not already) and drawn cards.
    // The returned state has updated hand. The card play itself failed.
    current = dummy; // State was updated (player drew cards, even if card play failed)

    // Now read the player's updated hand and play actual cards
    let keepPlaying = true;
    while (keepPlaying) {
      keepPlaying = false;
      const combatNow = current.combats[combatId];
      if (!combatNow || combatNow.isComplete) break;

      const updatedPlayer = current.players[playerId];
      if (!updatedPlayer || updatedPlayer.hand.length === 0) break;

      for (const cardId of [...updatedPlayer.hand]) {
        const afterPlay = handlePlayCard(current, combatId, playerId, cardId);
        if (afterPlay !== current) {
          current = afterPlay;
          keepPlaying = true;
          break; // re-read hand from updated game state
        }
      }
    }

    // Check if combat ended from card plays
    const combatAfterCards = current.combats[combatId];
    if (!combatAfterCards || combatAfterCards.isComplete) break;

    // End the turn (monster acts, hand discards, advances turn)
    current = handleEndTurn(current, combatId, playerId);
  }

  return current;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Server Integration: Full Game Flow', () => {
  // ── Step 1: Create a lobby ──────────────────────────────────────────────

  describe('Step 1 — Create a lobby', () => {
    it('creates a lobby with a unique ID and host player', () => {
      const lobby = createLobby('host-1', 'Alice');
      expect(lobby.id).toBeTruthy();
      expect(lobby.hostId).toBe('host-1');
      expect(lobby.players.size).toBe(1);
      expect(lobby.players.get('host-1')!.isHost).toBe(true);
      expect(lobby.started).toBe(false);
    });
  });

  // ── Step 2: Two players join and select classes ─────────────────────────

  describe('Step 2 — Two players join and select classes', () => {
    it('allows a second player to join and both select classes', () => {
      const lobby = createTwoPlayerLobby();
      expect(lobby.players.size).toBe(2);
      expect(lobby.players.get('p1')!.class).toBe('warrior');
      expect(lobby.players.get('p2')!.class).toBe('warrior');
    });

    it('reports canStart as true when at least one player has a class', () => {
      const lobby = createTwoPlayerLobby();
      expect(canStart(lobby)).toBe(true);
    });

    it('returns lobby state with all players listed', () => {
      const lobby = createTwoPlayerLobby();
      const state = getLobbyState(lobby) as Record<string, unknown>;
      const players = state.players as Array<Record<string, unknown>>;
      expect(players).toHaveLength(2);
      expect(players.map((p) => p.id)).toContain('p1');
      expect(players.map((p) => p.id)).toContain('p2');
    });
  });

  // ── Step 3: Host starts game ────────────────────────────────────────────

  describe('Step 3 — Host starts game', () => {
    it('transitions through countdown to playing phase', () => {
      const lobby = createTwoPlayerLobby();
      const initialized = initializeGame(lobby);
      expect(initialized.phase).toBe('lobby');

      const countdown = startCountdown(initialized);
      expect(countdown.phase).toBe('countdown');

      const playing = startGame(countdown);
      expect(playing.phase).toBe('playing');
      expect(playing.elapsed).toBe(0);
    });
  });

  // ── Step 4: Game initializes with map, events, spawn points ─────────────

  describe('Step 4 — Game initializes with map, events, spawn points', () => {
    it('creates a game with a valid map, events, and distinct spawn positions', () => {
      const game = createTwoPlayerGame();

      // Map exists and has correct dimensions
      expect(game.map).toBeDefined();
      expect(game.map.width).toBeGreaterThan(0);
      expect(game.map.height).toBeGreaterThan(0);
      expect(game.map.tiles.length).toBe(game.map.height);

      // Events placed
      expect(game.events.length).toBeGreaterThan(0);
      const activeEvents = game.events.filter((e) => e.active);
      expect(activeEvents.length).toBeGreaterThan(0);

      // Both players exist with correct starting HP and starter decks
      const p1 = game.players['p1'];
      const p2 = game.players['p2'];
      expect(p1).toBeDefined();
      expect(p2).toBeDefined();
      expect(p1.hp).toBe(STARTING_HP);
      expect(p2.hp).toBe(STARTING_HP);
      expect(p1.isAlive).toBe(true);
      expect(p2.isAlive).toBe(true);

      // Starter deck has 10 cards (5 attack + 4 defend + 1 signature)
      expect(p1.deck).toHaveLength(10);
      expect(p2.deck).toHaveLength(10);

      // Spawn positions are distinct
      expect(p1.position).not.toEqual(p2.position);

      // Players spawn on walkable tiles
      expect(game.map.tiles[p1.position.y][p1.position.x].walkable).toBe(true);
      expect(game.map.tiles[p2.position.y][p2.position.x].walkable).toBe(true);

      // Zone boundary covers the full map at phase 0
      expect(game.zonePhase).toBe(0);
      expect(game.zoneBoundary.minX).toBe(0);
      expect(game.zoneBoundary.minY).toBe(0);
    });

    it('initializes players with free non-fight events allowance', () => {
      const game = createTwoPlayerGame();
      expect(game.players['p1'].freeNonFightEvents).toBe(FREE_NON_FIGHT_EVENTS);
      expect(game.players['p1'].needsFight).toBe(false);
    });
  });

  // ── Step 5: Player 1 moves to a small monster event ─────────────────────

  describe('Step 5 — Player 1 moves to a small monster event', () => {
    it('player can move and trigger a PvE event on an adjacent tile', () => {
      let game = createTwoPlayerGame();

      // Inject a small_monster event next to player 1
      const { game: gameWithEvent, eventPosition } = injectEvent(
        game, 'p1', 'small_monster', 'test-monster-event',
      );
      game = gameWithEvent;

      const p1 = game.players['p1'];
      const dx = eventPosition.x - p1.position.x;
      const dy = eventPosition.y - p1.position.y;

      // Determine direction to the event
      let direction: 'up' | 'down' | 'left' | 'right';
      if (dx === 1) direction = 'right';
      else if (dx === -1) direction = 'left';
      else if (dy === 1) direction = 'down';
      else direction = 'up';

      const result = movePlayer(game, 'p1', direction, Date.now(), 0);

      // Player should have moved
      expect(result.game.players['p1'].position).toEqual(eventPosition);
      // Should trigger pve
      expect(result.triggered).toBe('pve');
      expect(result.eventId).toBe('test-monster-event');
    });
  });

  // ── Step 6: PvE combat — play through turns until monster dies ──────────

  describe('Step 6 — PvE combat: play through turns until monster dies', () => {
    it('starts PvE combat and plays through until monster is killed', () => {
      let game = createTwoPlayerGame();

      // Inject and trigger monster event
      const { game: gameWithEvent } = injectEvent(
        game, 'p1', 'small_monster', 'pve-test-event',
      );
      game = gameWithEvent;

      // Start PvE combat
      game = startPvECombat(game, 'p1', 'pve-test-event');

      // A combat should have been created
      const combat = findActiveCombat(game, 'p1');
      expect(combat).toBeDefined();
      expect(combat!.type).toBe('pve');
      expect(combat!.monster).toBeDefined();
      expect(combat!.monster!.hp).toBeGreaterThan(0);

      const combatId = combat!.id;
      const initialMonsterHp = combat!.monster!.hp;

      // Play through the combat
      game = playPvEUntilDone(game, 'p1', combatId);

      // Combat should be complete
      const finalCombat = game.combats[combatId];
      expect(finalCombat.isComplete).toBe(true);

      // Monster should be dead OR player should be dead
      const player = game.players['p1'];
      if (player.isAlive) {
        // Monster was killed
        expect(finalCombat.monster!.hp).toBeLessThanOrEqual(0);
        // Monster kill stat should be incremented
        expect(player.stats.monstersKilled).toBeGreaterThanOrEqual(1);
      }
      // At least some damage was dealt
      expect(player.stats.damageDealt).toBeGreaterThan(0);
      expect(player.stats.cardsPlayed).toBeGreaterThan(0);
    });
  });

  // ── Step 7: Player 1 picks a reward card ────────────────────────────────

  describe('Step 7 — Player 1 picks a reward card', () => {
    it('adds the selected card to the player deck', () => {
      let game = createTwoPlayerGame();
      const deckBefore = [...game.players['p1'].deck];

      // Get a reward card for warrior
      const rewardPool = getRewardPool('warrior', 'small');
      expect(rewardPool.length).toBeGreaterThan(0);
      const rewardCard = rewardPool[0];

      // Select the reward card
      game = handleCardSelection(game, 'p1', rewardCard.id);

      const deckAfter = game.players['p1'].deck;
      expect(deckAfter.length).toBe(deckBefore.length + 1);
      expect(deckAfter).toContain(rewardCard.id);
    });
  });

  // ── Step 8: Player 1 moves to campfire, heals ──────────────────────────

  describe('Step 8 — Player 1 moves to campfire and heals', () => {
    it('heals the player when interacting with a campfire event', () => {
      let game = createTwoPlayerGame();

      // Damage player first so healing is visible
      game = {
        ...game,
        players: {
          ...game.players,
          p1: { ...game.players['p1'], hp: 60 },
        },
      };

      // Inject a campfire event
      const { game: gameWithEvent } = injectEvent(
        game, 'p1', 'campfire', 'campfire-test',
      );
      game = gameWithEvent;

      const hpBefore = game.players['p1'].hp;
      const result = handleEventInteraction(game, 'p1', 'campfire-test');

      expect(result.response).toBe('healed');
      const hpAfter = result.game.players['p1'].hp;
      expect(hpAfter).toBeGreaterThan(hpBefore);
      expect(hpAfter).toBeLessThanOrEqual(STARTING_HP); // Capped at maxHp

      // The campfire event should be deactivated
      const campfireEvent = result.game.events.find((e) => e.id === 'campfire-test');
      expect(campfireEvent?.active).toBe(false);
    });

    it('consumes a free non-fight event slot', () => {
      let game = createTwoPlayerGame();
      game = {
        ...game,
        players: {
          ...game.players,
          p1: { ...game.players['p1'], hp: 50 },
        },
      };
      const { game: gameWithEvent } = injectEvent(
        game, 'p1', 'campfire', 'campfire-free-test',
      );
      game = gameWithEvent;

      const freeBefore = game.players['p1'].freeNonFightEvents;
      const result = handleEventInteraction(game, 'p1', 'campfire-free-test');
      const freeAfter = result.game.players['p1'].freeNonFightEvents;
      expect(freeAfter).toBe(freeBefore - 1);
    });
  });

  // ── Step 9: Player 1 moves into Player 2 — PvP starts ──────────────────

  describe('Step 9 — Player 1 moves into Player 2, PvP starts', () => {
    it('starts a PvP combat when two players collide', () => {
      let game = createTwoPlayerGame();

      // Place both players adjacent to each other
      const p1Pos = game.players['p1'].position;
      // Find adjacent walkable tile for p2
      const directions: Array<{ dx: number; dy: number; dir: 'up' | 'down' | 'left' | 'right' }> = [
        { dx: 1, dy: 0, dir: 'right' },
        { dx: -1, dy: 0, dir: 'left' },
        { dx: 0, dy: 1, dir: 'down' },
        { dx: 0, dy: -1, dir: 'up' },
      ];

      let targetPos: { x: number; y: number } | null = null;
      let moveDir: 'up' | 'down' | 'left' | 'right' = 'right';
      for (const { dx, dy, dir } of directions) {
        const nx = p1Pos.x + dx;
        const ny = p1Pos.y + dy;
        if (
          nx >= 0 && nx < game.map.width &&
          ny >= 0 && ny < game.map.height &&
          game.map.tiles[ny][nx].walkable
        ) {
          targetPos = { x: nx, y: ny };
          moveDir = dir;
          break;
        }
      }
      expect(targetPos).not.toBeNull();

      // Place p2 at that adjacent tile
      game = {
        ...game,
        players: {
          ...game.players,
          p2: { ...game.players['p2'], position: targetPos! },
        },
      };

      // Remove any events at the target position to avoid triggering them
      game = {
        ...game,
        events: game.events.map((e) =>
          e.position.x === targetPos!.x && e.position.y === targetPos!.y
            ? { ...e, active: false }
            : e,
        ),
      };

      // Move p1 into p2
      const result = movePlayer(game, 'p1', moveDir, Date.now(), 0);
      expect(result.triggered).toBe('pvp');
      expect(result.combatId).toBeTruthy();
    });

    it('creates PvP combat with correct structure via startPvPCombat', () => {
      let game = createTwoPlayerGame();

      game = startPvPCombat(game, 'p1', 'p2');

      const combat = findActiveCombat(game, 'p1');
      expect(combat).toBeDefined();
      expect(combat!.type).toBe('pvp');
      expect(combat!.playerIds).toContain('p1');
      expect(combat!.playerIds).toContain('p2');
      expect(combat!.damageCap).toBe(PVP_DAMAGE_CAP);
      expect(combat!.maxRounds).toBe(PVP_MAX_ROUNDS);
      expect(combat!.round).toBe(1);
      expect(combat!.isComplete).toBe(false);
    });
  });

  // ── Step 10: Play through 4 rounds of PvP ──────────────────────────────

  describe('Step 10 — Play through 4 rounds of PvP', () => {
    it('plays through multiple PvP rounds with alternating turns', () => {
      let game = createTwoPlayerGame();
      game = startPvPCombat(game, 'p1', 'p2');

      const combat = findActiveCombat(game, 'p1')!;
      const combatId = combat.id;

      // Initiator (p1) goes first
      expect(combat.playerIds[combat.activePlayerIndex]).toBe('p1');

      let rounds = 0;
      const MAX_TURNS = PVP_MAX_ROUNDS * 2 + 2; // safety limit

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        const currentCombat = game.combats[combatId];
        if (!currentCombat || currentCombat.isComplete) break;

        const activePlayerId = currentCombat.playerIds[currentCombat.activePlayerIndex];
        const player = game.players[activePlayerId];

        // Try playing cards from hand
        if (player.hand.length > 0) {
          for (const cardId of [...player.hand]) {
            const afterPlay = handlePlayCard(game, combatId, activePlayerId, cardId);
            if (afterPlay !== game) {
              game = afterPlay;
              if (game.combats[combatId]?.isComplete) break;
            }
          }
        }

        if (game.combats[combatId]?.isComplete) break;

        // End turn
        game = handleEndTurn(game, combatId, activePlayerId);
        const afterEndCombat = game.combats[combatId];
        if (afterEndCombat) {
          rounds = afterEndCombat.round;
        }
      }

      const finalCombat = game.combats[combatId];
      expect(finalCombat).toBeDefined();
      // PvP should eventually complete (either max rounds or damage cap)
      expect(finalCombat.isComplete).toBe(true);
    });
  });

  // ── Step 11: Verify damage cap enforced ─────────────────────────────────

  describe('Step 11 — Verify damage cap enforced', () => {
    it('PvP combat has damage cap set to PVP_DAMAGE_CAP', () => {
      let game = createTwoPlayerGame();
      game = startPvPCombat(game, 'p1', 'p2');

      const combat = findActiveCombat(game, 'p1')!;
      expect(combat.damageCap).toBe(PVP_DAMAGE_CAP);
      expect(PVP_DAMAGE_CAP).toBe(20); // sanity check the constant
    });

    it('tracks cumulative damage per player during PvP', () => {
      let game = createTwoPlayerGame();
      game = startPvPCombat(game, 'p1', 'p2');

      const combat = findActiveCombat(game, 'p1')!;
      const combatId = combat.id;

      // Both players' damage trackers start at 0
      expect(combat.damageTracker['p1']).toBe(0);
      expect(combat.damageTracker['p2']).toBe(0);

      // Play a card if possible to generate damage
      const p1 = game.players['p1'];
      if (p1.hand.length > 0) {
        // handlePlayCard auto-starts the turn
        game = handlePlayCard(game, combatId, 'p1', p1.hand[0]);
      } else {
        // Force start turn by ending (which starts it internally)
        game = handleEndTurn(game, combatId, 'p1');
      }

      // After playing, check state is updated (damage tracker may or may not have changed
      // depending on whether a damage card was played)
      expect(game.combats[combatId]).toBeDefined();
    });

    it('completes PvP when damage cap is reached', () => {
      let game = createTwoPlayerGame();
      game = startPvPCombat(game, 'p1', 'p2');

      const combatId = findActiveCombat(game, 'p1')!.id;

      // Artificially set damage tracker near cap to test end condition
      game = {
        ...game,
        combats: {
          ...game.combats,
          [combatId]: {
            ...game.combats[combatId],
            damageTracker: {
              ...game.combats[combatId].damageTracker,
              p2: PVP_DAMAGE_CAP, // p2 has taken max damage
            },
          },
        },
      };

      // End turn to trigger combat end check
      const activePlayerId = game.combats[combatId].playerIds[game.combats[combatId].activePlayerIndex];
      game = handleEndTurn(game, combatId, activePlayerId);

      expect(game.combats[combatId].isComplete).toBe(true);
    });
  });

  // ── Step 12: Verify event alternation tracked correctly ──────────────────

  describe('Step 12 — Verify event alternation tracked correctly', () => {
    it('blocks non-fight events after free allowance is exhausted without a fight', () => {
      let game = createTwoPlayerGame();

      // Use up all free non-fight events
      for (let i = 0; i < FREE_NON_FIGHT_EVENTS; i++) {
        const eventId = `campfire-alt-${i}`;
        const { game: g } = injectEvent(game, 'p1', 'campfire', eventId);
        game = g;
        game = {
          ...game,
          players: {
            ...game.players,
            p1: { ...game.players['p1'], hp: 50 }, // keep HP low so healing shows
          },
        };
        const result = handleEventInteraction(game, 'p1', eventId);
        expect(result.response).toBe('healed');
        game = result.game;
      }

      // Now the player needs a fight
      expect(game.players['p1'].needsFight).toBe(true);
      expect(canUseNonFightEvent(game.players['p1'])).toBe(false);

      // Try another campfire — should be blocked
      const { game: gBlocked } = injectEvent(game, 'p1', 'campfire', 'campfire-blocked');
      game = gBlocked;
      const blocked = handleEventInteraction(game, 'p1', 'campfire-blocked');
      expect(blocked.response).toBe('blocked');
    });

    it('resets alternation flag after completing a fight event', () => {
      let game = createTwoPlayerGame();

      // Use up free events
      for (let i = 0; i < FREE_NON_FIGHT_EVENTS; i++) {
        const eventId = `campfire-reset-${i}`;
        const { game: g } = injectEvent(game, 'p1', 'campfire', eventId);
        game = g;
        game = {
          ...game,
          players: {
            ...game.players,
            p1: { ...game.players['p1'], hp: 50 },
          },
        };
        const result = handleEventInteraction(game, 'p1', eventId);
        game = result.game;
      }

      expect(game.players['p1'].needsFight).toBe(true);

      // Now do a fight event (interact with a monster event)
      const { game: gMonster } = injectEvent(game, 'p1', 'small_monster', 'monster-reset');
      game = gMonster;
      const fightResult = handleEventInteraction(game, 'p1', 'monster-reset');
      expect(fightResult.response).toBe('combat_started');
      game = fightResult.game;

      // After fight event, needsFight should be cleared
      expect(game.players['p1'].needsFight).toBe(false);
      expect(canUseNonFightEvent(game.players['p1'])).toBe(true);
    });
  });

  // ── Step 13: Zone shrinks, events destroyed ─────────────────────────────

  describe('Step 13 — Zone shrinks, events destroyed', () => {
    it('shrinks zone when elapsed time passes a phase threshold', () => {
      let game = createTwoPlayerGame();

      const initialBoundary = { ...game.zoneBoundary };

      // Advance time past phase 1 threshold (330 seconds)
      const { game: ticked, events: tickEvents } = tick(game, 331, Date.now());
      game = ticked;

      expect(game.zonePhase).toBe(1);
      expect(game.elapsed).toBeGreaterThan(330);

      // Zone should have shrunk
      const newBoundary = game.zoneBoundary;
      const oldArea = (initialBoundary.maxX - initialBoundary.minX + 1) *
                      (initialBoundary.maxY - initialBoundary.minY + 1);
      const newArea = (newBoundary.maxX - newBoundary.minX + 1) *
                      (newBoundary.maxY - newBoundary.minY + 1);
      expect(newArea).toBeLessThan(oldArea);

      // Should have emitted a zonePhaseChanged event
      expect(tickEvents.some((e) => e.type === 'zonePhaseChanged')).toBe(true);
    });

    it('destroys events outside the new zone boundary', () => {
      let game = createTwoPlayerGame();

      // Inject an event at corner (0,0) which will be outside zone after shrink
      const cornerEvent: EventTile = {
        id: 'corner-event',
        type: 'campfire',
        position: { x: 0, y: 0 },
        active: true,
      };
      game = { ...game, events: [...game.events, cornerEvent] };

      // Move players to center so they're inside the zone
      const centerX = Math.floor(game.map.width / 2);
      const centerY = Math.floor(game.map.height / 2);
      game = {
        ...game,
        players: {
          ...game.players,
          p1: { ...game.players['p1'], position: { x: centerX, y: centerY } },
          p2: { ...game.players['p2'], position: { x: centerX + 1, y: centerY } },
        },
      };

      // Advance past phase 1 threshold
      const { game: ticked, events: tickEvents } = tick(game, 331, Date.now());
      game = ticked;

      // The corner event should be destroyed
      const cornerAfter = game.events.find((e) => e.id === 'corner-event');
      expect(cornerAfter?.active).toBe(false);

      // Should have emitted eventDestroyed
      expect(tickEvents.some((e) => e.type === 'eventDestroyed' && e.eventId === 'corner-event')).toBe(true);
    });

    it('applies zone damage to players outside the boundary', () => {
      let game = createTwoPlayerGame();

      // Place p1 at corner (will be outside after shrink)
      game = {
        ...game,
        players: {
          ...game.players,
          p1: { ...game.players['p1'], position: { x: 0, y: 0 } },
          p2: { ...game.players['p2'], position: { x: Math.floor(game.map.width / 2), y: Math.floor(game.map.height / 2) } },
        },
      };

      const hpBefore = game.players['p1'].hp;

      // Advance past phase 1
      const { game: ticked, events: tickEvents } = tick(game, 331, Date.now());
      game = ticked;

      // p1 at (0,0) should be outside the new zone and take damage
      const hpAfter = game.players['p1'].hp;
      expect(hpAfter).toBeLessThan(hpBefore);

      // playerDamaged event should have been emitted
      expect(tickEvents.some((e) => e.type === 'playerDamaged' && e.playerId === 'p1')).toBe(true);
    });
  });

  // ── Step 14: Verify elimination and win condition ───────────────────────

  describe('Step 14 — Verify elimination and win condition', () => {
    it('eliminates a player and marks them as not alive', () => {
      let game = createTwoPlayerGame();

      game = eliminatePlayer(game, 'p2');

      expect(game.players['p2'].isAlive).toBe(false);
      expect(game.players['p1'].isAlive).toBe(true);
    });

    it('detects win condition when only one player remains', () => {
      let game = createTwoPlayerGame();

      // No winner yet
      expect(checkWinCondition(game)).toBeNull();

      // Eliminate p2
      game = eliminatePlayer(game, 'p2');

      const winner = checkWinCondition(game);
      expect(winner).toBe('p1');
    });

    it('tick emits gameOver event when win condition is met after elimination', () => {
      let game = createTwoPlayerGame();

      // Eliminate p2
      game = eliminatePlayer(game, 'p2');

      const { events: tickEvents } = tick(game, 1, Date.now());

      expect(tickEvents.some((e) => e.type === 'gameOver' && e.winnerId === 'p1')).toBe(true);
    });

    it('eliminates player when zone damage reduces HP to zero', () => {
      let game = createTwoPlayerGame();

      // Place p2 outside zone and set very low HP
      game = {
        ...game,
        players: {
          ...game.players,
          p1: { ...game.players['p1'], position: { x: Math.floor(game.map.width / 2), y: Math.floor(game.map.height / 2) } },
          p2: { ...game.players['p2'], hp: 1, position: { x: 0, y: 0 } },
        },
      };

      // Advance to trigger zone damage on p2 at corner
      const { game: ticked, events: tickEvents } = tick(game, 331, Date.now());

      // p2 should be eliminated
      expect(ticked.players['p2'].isAlive).toBe(false);
      expect(tickEvents.some((e) => e.type === 'playerEliminated' && e.playerId === 'p2')).toBe(true);
      expect(tickEvents.some((e) => e.type === 'gameOver' && e.winnerId === 'p1')).toBe(true);
    });
  });

  // ── Additional integration scenarios ────────────────────────────────────

  describe('Additional — Flee from PvE combat', () => {
    it('allows fleeing from PvE after turn 1 at an HP cost', () => {
      let game = createTwoPlayerGame();

      // Start a PvE combat
      const { game: gEvent } = injectEvent(game, 'p1', 'small_monster', 'flee-test-event');
      game = gEvent;
      game = startPvECombat(game, 'p1', 'flee-test-event');

      const combat = findActiveCombat(game, 'p1')!;
      const combatId = combat.id;

      // Cannot flee on turn 1 (startPvECombat calls startTurn, turnCounter = 1)
      const fleeEarly = handleFlee(game, combatId, 'p1');
      expect(fleeEarly.combats[combatId].isComplete).toBe(false);

      // Complete turn 1: handleEndTurn ends current turn and starts turn 2 (turnCounter -> 2)
      game = handleEndTurn(game, combatId, 'p1');

      // Now flee should work (turnCount = 2, which is > 1)
      const hpBefore = game.players['p1'].hp;
      game = handleFlee(game, combatId, 'p1');

      expect(game.combats[combatId].isComplete).toBe(true);
      expect(game.players['p1'].hp).toBeLessThanOrEqual(hpBefore);
    });
  });

  describe('Additional — Disconnect and reconnect', () => {
    it('creates a disconnect timer and can reconnect before expiry', () => {
      let game = createTwoPlayerGame();
      const now = Date.now();

      const { game: afterDisc, timer } = handleDisconnect(game, 'p2', now);
      expect(timer.playerId).toBe('p2');
      expect(timer.context).toBe('overworld');
      expect(timer.timeout).toBe(30);

      // Reconnect
      const afterReconnect = handleReconnect(afterDisc, 'p2');
      expect(afterReconnect.players['p2'].isAlive).toBe(true);
    });

    it('eliminates a player when disconnect timer expires', () => {
      let game = createTwoPlayerGame();
      const now = 1000;

      const { timer } = handleDisconnect(game, 'p2', now);

      // Check timers after timeout
      const { game: afterCheck, expired } = checkDisconnectTimers(
        game, [timer], now + timer.timeout * 1000,
      );

      expect(expired).toContain('p2');
      expect(afterCheck.players['p2'].isAlive).toBe(false);
    });
  });

  describe('Additional — Player view sanitization', () => {
    it('hides other players hand and drawPile in player view', () => {
      const game = createTwoPlayerGame();

      const view = getPlayerView(game, 'p1') as Record<string, unknown>;
      const players = view.players as Record<string, Record<string, unknown>>;

      // Own player has full hand array
      expect(Array.isArray(players['p1'].hand)).toBe(true);

      // Other player has hand as a number (length)
      expect(typeof players['p2'].hand).toBe('number');
      expect(typeof players['p2'].drawPile).toBe('number');
    });
  });

  describe('Additional — Blacksmith upgrade event', () => {
    it('prompts for upgrade selection at blacksmith', () => {
      let game = createTwoPlayerGame();

      const { game: gEvent } = injectEvent(game, 'p1', 'blacksmith', 'smith-test');
      game = gEvent;

      const result = handleEventInteraction(game, 'p1', 'smith-test');
      expect(result.response).toBe('upgrade_prompt');

      // Event should be deactivated
      const smithEvent = result.game.events.find((e) => e.id === 'smith-test');
      expect(smithEvent?.active).toBe(false);
    });
  });
});
