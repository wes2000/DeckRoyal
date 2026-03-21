export type Direction = 'up' | 'down' | 'left' | 'right';

export type ClientMessage =
  | { type: 'joinLobby'; name: string; gameId: string }
  | { type: 'selectClass'; class: 'warrior' | 'mage' | 'rogue' }
  | { type: 'startGame' }
  | { type: 'move'; direction: Direction }
  | { type: 'playCard'; cardId: string; targetId?: string }
  | { type: 'endTurn' }
  | { type: 'flee' }
  | { type: 'selectCard'; cardId: string }
  | { type: 'upgradeCard'; cardId: string }
  | { type: 'removeCard'; cardId: string };

export type ServerMessage =
  | { type: 'lobbyState'; data: unknown }
  | { type: 'gameState'; data: unknown }
  | { type: 'combatState'; data: unknown }
  | { type: 'eventResult'; data: unknown }
  | { type: 'cardChoice'; data: unknown }
  | { type: 'playerEliminated'; data: { playerId: string; killedBy?: string } }
  | { type: 'gameOver'; data: { winnerId: string; stats: unknown } }
  | { type: 'error'; data: { message: string } }
  | { type: 'zoneWarning'; data: { nextPhase: number; timeUntil: number } }
  | { type: 'countdown'; data: { seconds: number } };

const VALID_DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const VALID_CLASSES = ['warrior', 'mage', 'rogue'] as const;

export function isValidClientMessage(msg: unknown): msg is ClientMessage {
  if (typeof msg !== 'object' || msg === null) return false;
  const m = msg as Record<string, unknown>;

  switch (m.type) {
    case 'joinLobby':
      return typeof m.name === 'string' && typeof m.gameId === 'string';

    case 'selectClass':
      return (VALID_CLASSES as readonly unknown[]).includes(m.class);

    case 'startGame':
    case 'endTurn':
    case 'flee':
      return true;

    case 'move':
      return (VALID_DIRECTIONS as unknown[]).includes(m.direction);

    case 'playCard':
      return typeof m.cardId === 'string' &&
        (m.targetId === undefined || typeof m.targetId === 'string');

    case 'selectCard':
    case 'upgradeCard':
    case 'removeCard':
      return typeof m.cardId === 'string';

    default:
      return false;
  }
}

export function parseClientMessage(raw: string): ClientMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (isValidClientMessage(parsed)) {
    return parsed;
  }
  return null;
}

export function createServerMessage<T extends ServerMessage['type']>(
  type: T,
  data: Extract<ServerMessage, { type: T }>['data']
): ServerMessage {
  return { type, data } as ServerMessage;
}
