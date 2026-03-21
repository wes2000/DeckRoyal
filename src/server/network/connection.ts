import { WebSocket } from 'ws';
import type { ClientConnection } from './ws-server';

export function createConnection(ws: WebSocket, id: string): ClientConnection {
  return {
    id,
    ws,
    gameId: null,
    playerId: null,
    lastActivity: Date.now(),
  };
}

export function associateWithGame(
  conn: ClientConnection,
  gameId: string,
  playerId: string
): ClientConnection {
  conn.gameId = gameId;
  conn.playerId = playerId;
  return conn;
}
