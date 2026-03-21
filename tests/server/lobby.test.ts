import { describe, it, expect } from 'vitest';
import {
  createLobby,
  joinLobby,
  selectClass,
  leaveLobby,
  canStart,
  getLobbyState,
} from '../../src/server/lobby';
import type { Lobby } from '../../src/server/lobby';

// ─── createLobby ──────────────────────────────────────────────────────────────

describe('createLobby', () => {
  it('returns a lobby with a unique id and correct hostId', () => {
    const a = createLobby('host-1', 'Alice');
    const b = createLobby('host-2', 'Bob');
    expect(a.id).toBeTruthy();
    expect(b.id).toBeTruthy();
    expect(a.id).not.toBe(b.id);
    expect(a.hostId).toBe('host-1');
    expect(b.hostId).toBe('host-2');
  });

  it('generates a 6-char uppercase alphanumeric code', () => {
    const lobby = createLobby('host-1', 'Alice');
    expect(lobby.code).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('codes are (virtually always) unique across lobbies', () => {
    const codes = new Set(
      Array.from({ length: 20 }, (_, i) => createLobby(`h${i}`, `P${i}`).code)
    );
    // With 36^6 ≈ 2.1 billion possibilities, 20 should all be unique
    expect(codes.size).toBe(20);
  });

  it('includes the host as the first player with isHost=true and no class', () => {
    const lobby = createLobby('host-1', 'Alice');
    const host = lobby.players.get('host-1');
    expect(host).toBeDefined();
    expect(host!.id).toBe('host-1');
    expect(host!.name).toBe('Alice');
    expect(host!.isHost).toBe(true);
    expect(host!.class).toBeNull();
  });

  it('starts with started=false', () => {
    const lobby = createLobby('host-1', 'Alice');
    expect(lobby.started).toBe(false);
  });
});

// ─── joinLobby ────────────────────────────────────────────────────────────────

describe('joinLobby', () => {
  it('adds a player to the lobby and returns updated lobby', () => {
    const lobby = createLobby('host-1', 'Alice');
    const result = joinLobby(lobby, 'player-2', 'Bob');
    expect('error' in result).toBe(false);
    const updated = result as Lobby;
    expect(updated.players.has('player-2')).toBe(true);
    expect(updated.players.get('player-2')!.name).toBe('Bob');
    expect(updated.players.get('player-2')!.isHost).toBe(false);
    expect(updated.players.get('player-2')!.class).toBeNull();
  });

  it('rejects when lobby is full (8 players)', () => {
    let lobby = createLobby('host-1', 'Alice');
    for (let i = 2; i <= 8; i++) {
      const result = joinLobby(lobby, `player-${i}`, `Player ${i}`);
      lobby = result as Lobby;
    }
    expect(lobby.players.size).toBe(8);
    const result = joinLobby(lobby, 'player-9', 'Eve');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/full/i);
  });

  it('rejects when the game has already started', () => {
    const lobby = createLobby('host-1', 'Alice');
    const startedLobby: Lobby = { ...lobby, started: true };
    const result = joinLobby(startedLobby, 'player-2', 'Bob');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/started/i);
  });

  it('does not mutate the original lobby', () => {
    const lobby = createLobby('host-1', 'Alice');
    const originalSize = lobby.players.size;
    joinLobby(lobby, 'player-2', 'Bob');
    expect(lobby.players.size).toBe(originalSize);
  });
});

// ─── selectClass ──────────────────────────────────────────────────────────────

describe('selectClass', () => {
  it("updates a player's class", () => {
    const lobby = createLobby('host-1', 'Alice');
    const result = selectClass(lobby, 'host-1', 'warrior');
    expect('error' in result).toBe(false);
    const updated = result as Lobby;
    expect(updated.players.get('host-1')!.class).toBe('warrior');
  });

  it('allows multiple players to pick the same class', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    lobby = selectClass(lobby, 'host-1', 'mage') as Lobby;
    lobby = selectClass(lobby, 'player-2', 'mage') as Lobby;
    expect(lobby.players.get('host-1')!.class).toBe('mage');
    expect(lobby.players.get('player-2')!.class).toBe('mage');
  });

  it('returns an error if the player is not in the lobby', () => {
    const lobby = createLobby('host-1', 'Alice');
    const result = selectClass(lobby, 'ghost', 'rogue');
    expect('error' in result).toBe(true);
    expect((result as { error: string }).error).toMatch(/not found|not in/i);
  });
});

// ─── leaveLobby ───────────────────────────────────────────────────────────────

describe('leaveLobby', () => {
  it('removes the player from the lobby', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    const result = leaveLobby(lobby, 'player-2');
    expect(result.players.has('player-2')).toBe(false);
  });

  it('transfers host when the host leaves', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    lobby = joinLobby(lobby, 'player-3', 'Carol') as Lobby;
    const result = leaveLobby(lobby, 'host-1');
    expect(result.players.has('host-1')).toBe(false);
    // Next player in iteration order should be new host
    const newHostId = result.hostId;
    expect(newHostId).not.toBe('host-1');
    expect(result.players.get(newHostId)!.isHost).toBe(true);
    // Original players that remain should have correct isHost flags
    result.players.forEach((p) => {
      expect(p.isHost).toBe(p.id === newHostId);
    });
  });

  it('returns an empty lobby when the last player leaves', () => {
    const lobby = createLobby('host-1', 'Alice');
    const result = leaveLobby(lobby, 'host-1');
    expect(result.players.size).toBe(0);
  });

  it('does not mutate the original lobby', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    leaveLobby(lobby, 'player-2');
    expect(lobby.players.has('player-2')).toBe(true);
  });
});

// ─── canStart ─────────────────────────────────────────────────────────────────

describe('canStart', () => {
  it('returns false when no player has selected a class', () => {
    const lobby = createLobby('host-1', 'Alice');
    expect(canStart(lobby)).toBe(false);
  });

  it('returns true when at least one player has a class selected', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = selectClass(lobby, 'host-1', 'warrior') as Lobby;
    expect(canStart(lobby)).toBe(true);
  });

  it('returns true even if only one of many players has a class', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    // Only host picks a class
    lobby = selectClass(lobby, 'host-1', 'rogue') as Lobby;
    expect(canStart(lobby)).toBe(true);
  });

  it('returns false for an empty lobby', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = leaveLobby(lobby, 'host-1');
    expect(canStart(lobby)).toBe(false);
  });
});

// ─── getLobbyState ────────────────────────────────────────────────────────────

describe('getLobbyState', () => {
  it('returns a plain serializable object (not a Lobby instance)', () => {
    const lobby = createLobby('host-1', 'Alice');
    const state = getLobbyState(lobby);
    // Must be JSON-serializable
    expect(() => JSON.stringify(state)).not.toThrow();
    const str = JSON.stringify(state);
    const parsed = JSON.parse(str);
    expect(typeof parsed).toBe('object');
  });

  it('includes code, hostId, started, and a player list', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = joinLobby(lobby, 'player-2', 'Bob') as Lobby;
    const state = getLobbyState(lobby) as Record<string, unknown>;
    expect(state.code).toBe(lobby.code);
    expect(state.hostId).toBe('host-1');
    expect(state.started).toBe(false);
    // players should be an array (serializable) rather than a Map
    expect(Array.isArray(state.players)).toBe(true);
    const players = state.players as unknown[];
    expect(players).toHaveLength(2);
  });

  it('player entries contain id, name, class, and isHost', () => {
    let lobby = createLobby('host-1', 'Alice');
    lobby = selectClass(lobby, 'host-1', 'mage') as Lobby;
    const state = getLobbyState(lobby) as { players: Record<string, unknown>[] };
    const hostEntry = state.players.find(
      (p: Record<string, unknown>) => p.id === 'host-1'
    );
    expect(hostEntry).toBeDefined();
    expect(hostEntry!.name).toBe('Alice');
    expect(hostEntry!.class).toBe('mage');
    expect(hostEntry!.isHost).toBe(true);
  });
});
