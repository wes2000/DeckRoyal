import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { parseClientMessage } from './messages';
import { createConnection } from './connection';

export interface ClientConnection {
  id: string;
  ws: WebSocket;
  gameId: string | null;
  playerId: string | null;
  lastActivity: number;
}

export class GameWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, ClientConnection> = new Map();
  private onMessage: (connId: string, msg: any) => void;
  private onDisconnect: (connId: string) => void;

  constructor(
    server: any,
    onMessage: (connId: string, msg: any) => void,
    onDisconnect: (connId: string) => void
  ) {
    this.onMessage = onMessage;
    this.onDisconnect = onDisconnect;

    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      const id = crypto.randomUUID();
      const conn = createConnection(ws, id);
      this.connections.set(id, conn);

      ws.on('message', (data: Buffer | string) => {
        const conn = this.connections.get(id);
        if (conn) {
          conn.lastActivity = Date.now();
        }

        const raw = typeof data === 'string' ? data : data.toString();
        const parsed = parseClientMessage(raw);
        if (parsed !== null) {
          this.onMessage(id, parsed);
        }
      });

      ws.on('close', () => {
        this.onDisconnect(id);
        this.connections.delete(id);
      });

      ws.on('error', () => {
        this.onDisconnect(id);
        this.connections.delete(id);
      });
    });
  }

  broadcast(gameId: string, message: any): void {
    const payload = JSON.stringify(message);
    for (const conn of this.connections.values()) {
      if (conn.gameId === gameId && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(payload);
      }
    }
  }

  sendTo(connId: string, message: any): void {
    const conn = this.connections.get(connId);
    if (conn && conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.send(JSON.stringify(message));
    }
  }

  getConnection(connId: string): ClientConnection | undefined {
    return this.connections.get(connId);
  }
}
