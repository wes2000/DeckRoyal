import type { ClientMessage, ServerMessage } from '../../server/network/messages';

type MessageHandler = (msg: ServerMessage) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url?: string) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    this.url = url || `${protocol}//${window.location.host}`;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.onopen = () => { this.reconnectAttempts = 0; resolve(); };
      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data) as ServerMessage;
        const handlers = this.handlers.get(msg.type) || [];
        handlers.forEach(h => h(msg));
        (this.handlers.get('*') || []).forEach(h => h(msg));
      };
      this.ws.onclose = () => this.attemptReconnect();
      this.ws.onerror = () => reject(new Error('WebSocket connection failed'));
    });
  }

  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) this.handlers.set(type, []);
    this.handlers.get(type)!.push(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      this.handlers.set(type, handlers.filter(h => h !== handler));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;
    this.reconnectAttempts++;
    setTimeout(() => this.connect(), 1000 * this.reconnectAttempts);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}

// Singleton for app-wide use
export const wsClient = new WSClient();
