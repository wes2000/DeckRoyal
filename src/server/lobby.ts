import type { PlayerClass } from '@shared/types';

export interface LobbyPlayer {
  id: string;
  name: string;
  class: PlayerClass | null;
  isHost: boolean;
}

export interface Lobby {
  id: string;
  code: string;     // 6-char shareable code
  players: Map<string, LobbyPlayer>;
  hostId: string;
  started: boolean;
}

const MAX_PLAYERS = 8;

function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function generateCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function createLobby(hostId: string, hostName: string): Lobby {
  const hostPlayer: LobbyPlayer = {
    id: hostId,
    name: hostName,
    class: null,
    isHost: true,
  };

  const players = new Map<string, LobbyPlayer>();
  players.set(hostId, hostPlayer);

  return {
    id: generateId(),
    code: generateCode(),
    players,
    hostId,
    started: false,
  };
}

export function joinLobby(
  lobby: Lobby,
  playerId: string,
  name: string
): Lobby | { error: string } {
  if (lobby.started) {
    return { error: 'Game has already started' };
  }

  if (lobby.players.size >= MAX_PLAYERS) {
    return { error: 'Lobby is full (maximum 8 players)' };
  }

  const newPlayer: LobbyPlayer = {
    id: playerId,
    name,
    class: null,
    isHost: false,
  };

  const newPlayers = new Map(lobby.players);
  newPlayers.set(playerId, newPlayer);

  return { ...lobby, players: newPlayers };
}

export function selectClass(
  lobby: Lobby,
  playerId: string,
  playerClass: PlayerClass
): Lobby | { error: string } {
  if (!lobby.players.has(playerId)) {
    return { error: `Player not found in lobby` };
  }

  const existing = lobby.players.get(playerId)!;
  const updated: LobbyPlayer = { ...existing, class: playerClass };

  const newPlayers = new Map(lobby.players);
  newPlayers.set(playerId, updated);

  return { ...lobby, players: newPlayers };
}

export function leaveLobby(lobby: Lobby, playerId: string): Lobby {
  const newPlayers = new Map(lobby.players);
  newPlayers.delete(playerId);

  // No players remain
  if (newPlayers.size === 0) {
    return { ...lobby, players: newPlayers };
  }

  // Non-host left — nothing else to do
  if (playerId !== lobby.hostId) {
    return { ...lobby, players: newPlayers };
  }

  // Host left — transfer host to the first remaining player in iteration order
  const nextEntry = newPlayers.values().next().value as LobbyPlayer;
  const newHostId = nextEntry.id;

  // Update the new host's isHost flag and clear it from all others
  for (const [id, player] of newPlayers) {
    newPlayers.set(id, { ...player, isHost: id === newHostId });
  }

  return { ...lobby, players: newPlayers, hostId: newHostId };
}

export function canStart(lobby: Lobby): boolean {
  if (lobby.players.size === 0) return false;
  for (const player of lobby.players.values()) {
    if (player.class !== null) return true;
  }
  return false;
}

export function getLobbyState(lobby: Lobby): unknown {
  const players = Array.from(lobby.players.values()).map((p) => ({
    id: p.id,
    name: p.name,
    class: p.class,
    isHost: p.isHost,
  }));

  return {
    id: lobby.id,
    code: lobby.code,
    hostId: lobby.hostId,
    started: lobby.started,
    players,
  };
}
