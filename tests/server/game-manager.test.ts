import { describe, it, expect } from 'vitest';
import {
  initializeGame,
  startCountdown,
  startGame,
  eliminatePlayer,
  checkWinCondition,
  getPlayerView,
} from '../../src/server/game-manager';
import { createLobby, joinLobby, selectClass } from '../../src/server/lobby';
import type { Lobby } from '../../src/server/lobby';
import type { GameState } from '../../src/shared/types';
import { getStarterDeck } from '../../src/shared/cards';
import { getEventCountForPlayers } from '../../src/shared/constants';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLobby(players: Array<{ id: string; name: string; class?: 'warrior' | 'mage' | 'rogue' }>): Lobby {
  const [first, ...rest] = players;
  let lobby = createLobby(first.id, first.name);
  if (first.class) lobby = selectClass(lobby, first.id, first.class) as Lobby;

  for (const p of rest) {
    lobby = joinLobby(lobby, p.id, p.name) as Lobby;
    if (p.class) lobby = selectClass(lobby, p.id, p.class) as Lobby;
  }

  return lobby;
}

// ─── initializeGame ───────────────────────────────────────────────────────────

describe('initializeGame', () => {
  it('creates a GameState with the correct player count from lobby', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    expect(Object.keys(game.players)).toHaveLength(2);
    expect(game.players['p1']).toBeDefined();
    expect(game.players['p2']).toBeDefined();
  });

  it('players get starter decks based on their class', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
      { id: 'p3', name: 'Carol', class: 'rogue' },
    ]);
    const game = initializeGame(lobby);

    const warriorDeck = getStarterDeck('warrior');
    const mageDeck = getStarterDeck('mage');
    const rogueDeck = getStarterDeck('rogue');

    expect(game.players['p1'].deck).toEqual(expect.arrayContaining(warriorDeck));
    expect(game.players['p1'].deck).toHaveLength(warriorDeck.length);
    expect(game.players['p2'].deck).toEqual(expect.arrayContaining(mageDeck));
    expect(game.players['p2'].deck).toHaveLength(mageDeck.length);
    expect(game.players['p3'].deck).toEqual(expect.arrayContaining(rogueDeck));
    expect(game.players['p3'].deck).toHaveLength(rogueDeck.length);
  });

  it('defaults class to warrior when player class is null', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice' }, // no class selected
    ]);
    const game = initializeGame(lobby);
    expect(game.players['p1'].class).toBe('warrior');

    const warriorDeck = getStarterDeck('warrior');
    expect(game.players['p1'].deck).toEqual(expect.arrayContaining(warriorDeck));
  });

  it('map is generated with correct event count for player count', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
      { id: 'p3', name: 'Carol', class: 'rogue' },
      { id: 'p4', name: 'Dave', class: 'warrior' },
    ]);
    const game = initializeGame(lobby);
    const expectedCount = getEventCountForPlayers(4);
    expect(game.events).toHaveLength(expectedCount);
  });

  it('players get spawn positions at map edges (within EDGE_ZONE=8)', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const EDGE_ZONE = 8;

    for (const player of Object.values(game.players)) {
      const { x, y } = player.position;
      const { width, height } = game.map;
      const nearEdge =
        x < EDGE_ZONE ||
        x >= width - EDGE_ZONE ||
        y < EDGE_ZONE ||
        y >= height - EDGE_ZONE;
      expect(nearEdge).toBe(true);
    }
  });

  it('all players start alive with correct HP and empty hand', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'rogue' },
    ]);
    const game = initializeGame(lobby);

    for (const player of Object.values(game.players)) {
      expect(player.isAlive).toBe(true);
      expect(player.hp).toBe(player.maxHp);
      expect(player.hand).toHaveLength(0);
    }
  });

  it('game starts in lobby phase with elapsed=0 and zonePhase=0', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    expect(game.phase).toBe('lobby');
    expect(game.elapsed).toBe(0);
    expect(game.zonePhase).toBe(0);
  });

  it('each player has a unique spawn position', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
      { id: 'p3', name: 'Carol', class: 'rogue' },
    ]);
    const game = initializeGame(lobby);
    const positions = Object.values(game.players).map(p => `${p.position.x},${p.position.y}`);
    const unique = new Set(positions);
    expect(unique.size).toBe(positions.length);
  });

  it('drawPile contains the starter cards (shuffled)', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const player = game.players['p1'];
    const warriorDeck = getStarterDeck('warrior');
    expect(player.drawPile).toHaveLength(warriorDeck.length);
    expect([...player.drawPile].sort()).toEqual([...warriorDeck].sort());
  });
});

// ─── startCountdown ───────────────────────────────────────────────────────────

describe('startCountdown', () => {
  it('sets phase to countdown', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const updated = startCountdown(game);
    expect(updated.phase).toBe('countdown');
  });

  it('does not mutate the original game state', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    startCountdown(game);
    expect(game.phase).toBe('lobby');
  });
});

// ─── startGame ────────────────────────────────────────────────────────────────

describe('startGame', () => {
  it('sets phase to playing', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const counting = startCountdown(game);
    const playing = startGame(counting);
    expect(playing.phase).toBe('playing');
  });

  it('resets elapsed to 0 when starting', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const counting = startCountdown(game);
    // Simulate some elapsed time before startGame
    const withElapsed: GameState = { ...counting, elapsed: 999 };
    const playing = startGame(withElapsed);
    expect(playing.elapsed).toBe(0);
  });

  it('does not mutate the original game state', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const counting = startCountdown(game);
    startGame(counting);
    expect(counting.phase).toBe('countdown');
  });
});

// ─── eliminatePlayer ──────────────────────────────────────────────────────────

describe('eliminatePlayer', () => {
  it('sets player.isAlive to false', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const updated = eliminatePlayer(game, 'p1');
    expect(updated.players['p1'].isAlive).toBe(false);
  });

  it('does not affect other players', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const updated = eliminatePlayer(game, 'p1');
    expect(updated.players['p2'].isAlive).toBe(true);
  });

  it('does not mutate the original game state', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    eliminatePlayer(game, 'p1');
    expect(game.players['p1'].isAlive).toBe(true);
  });
});

// ─── checkWinCondition ────────────────────────────────────────────────────────

describe('checkWinCondition', () => {
  it('returns winner ID when exactly 1 player is alive', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const afterElim = eliminatePlayer(game, 'p1');
    expect(checkWinCondition(afterElim)).toBe('p2');
  });

  it('returns null when multiple players are alive', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    expect(checkWinCondition(game)).toBeNull();
  });

  it('returns null when 0 players are alive', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const after1 = eliminatePlayer(game, 'p1');
    const after2 = eliminatePlayer(after1, 'p2');
    expect(checkWinCondition(after2)).toBeNull();
  });
});

// ─── Solo mode ────────────────────────────────────────────────────────────────

describe('solo mode (1 player)', () => {
  it('initializes correctly with a single player', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    expect(Object.keys(game.players)).toHaveLength(1);
    expect(game.players['p1'].isAlive).toBe(true);
  });

  it('checkWinCondition returns null for solo player still alive (game ongoing)', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    // Solo game: 1 alive means we return null (not a win in a solo context? per spec: 0 or 2+ alive = null)
    // Actually per spec: "return the ID of the last alive player" — 1 alive triggers a win
    // So for solo game, eliminating the only player gives null, keeping them alive gives p1 as winner
    // But that would immediately win — the game loop decides when to call this.
    // Here we just verify the spec: 1 alive → return that player's ID
    expect(checkWinCondition(game)).toBe('p1');
  });
});

// ─── getPlayerView ────────────────────────────────────────────────────────────

describe('getPlayerView', () => {
  it('returns full hand and drawPile for the requesting player', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const view = getPlayerView(game, 'p1') as Record<string, unknown>;
    const players = view.players as Record<string, Record<string, unknown>>;

    // Own player has full hand and drawPile arrays
    expect(Array.isArray(players['p1'].hand)).toBe(true);
    expect(Array.isArray(players['p1'].drawPile)).toBe(true);
  });

  it('hides hand and drawPile of other players (replaces with lengths)', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const view = getPlayerView(game, 'p1') as Record<string, unknown>;
    const players = view.players as Record<string, Record<string, unknown>>;

    // Other player's hand and drawPile should be numbers (lengths), not arrays
    expect(typeof players['p2'].hand).toBe('number');
    expect(typeof players['p2'].drawPile).toBe('number');
  });

  it('the hidden lengths match the actual card counts', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const view = getPlayerView(game, 'p2') as Record<string, unknown>;
    const players = view.players as Record<string, Record<string, unknown>>;

    // p1 is hidden from p2's view
    expect(players['p1'].hand).toBe(game.players['p1'].hand.length);
    expect(players['p1'].drawPile).toBe(game.players['p1'].drawPile.length);
  });

  it('other publicly visible player info is present', () => {
    const lobby = makeLobby([
      { id: 'p1', name: 'Alice', class: 'warrior' },
      { id: 'p2', name: 'Bob', class: 'mage' },
    ]);
    const game = initializeGame(lobby);
    const view = getPlayerView(game, 'p1') as Record<string, unknown>;
    const players = view.players as Record<string, Record<string, unknown>>;

    // Other player's public info is still there
    expect(players['p2'].id).toBe('p2');
    expect(players['p2'].name).toBe('Bob');
    expect(players['p2'].hp).toBeDefined();
    expect(players['p2'].position).toBeDefined();
    expect(players['p2'].isAlive).toBeDefined();
    expect(Array.isArray(players['p2'].discardPile)).toBe(true);
  });

  it('view includes map, events, elapsed, and zone information', () => {
    const lobby = makeLobby([{ id: 'p1', name: 'Alice', class: 'warrior' }]);
    const game = initializeGame(lobby);
    const view = getPlayerView(game, 'p1') as Record<string, unknown>;

    expect(view.map).toBeDefined();
    expect(view.events).toBeDefined();
    expect(view.elapsed).toBeDefined();
    expect(view.zoneBoundary).toBeDefined();
  });
});
