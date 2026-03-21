import { describe, it, expect } from 'vitest';
import {
  ClientMessage, ServerMessage, parseClientMessage, createServerMessage,
  isValidClientMessage
} from '../../../src/server/network/messages';

describe('message protocol', () => {
  it('parses valid move message', () => {
    const raw = JSON.stringify({ type: 'move', direction: 'up' });
    const msg = parseClientMessage(raw);
    expect(msg).toEqual({ type: 'move', direction: 'up' });
  });

  it('rejects invalid message', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
  });

  it('validates all client message types', () => {
    expect(isValidClientMessage({ type: 'move', direction: 'up' })).toBe(true);
    expect(isValidClientMessage({ type: 'move', direction: 'diagonal' })).toBe(false);
    expect(isValidClientMessage({ type: 'playCard', cardId: 'w_strike' })).toBe(true);
    expect(isValidClientMessage({ type: 'endTurn' })).toBe(true);
    expect(isValidClientMessage({ type: 'joinLobby', name: 'Player1', gameId: 'ABC' })).toBe(true);
    expect(isValidClientMessage({ type: 'selectClass', class: 'warrior' })).toBe(true);
    expect(isValidClientMessage({ type: 'startGame' })).toBe(true);
    expect(isValidClientMessage({ type: 'flee' })).toBe(true);
    expect(isValidClientMessage({ type: 'selectCard', cardId: 'w_bash' })).toBe(true);
    expect(isValidClientMessage({ type: 'upgradeCard', cardId: 'w_strike' })).toBe(true);
    expect(isValidClientMessage({ type: 'removeCard', cardId: 'w_strike' })).toBe(true);
  });

  it('creates server messages', () => {
    const msg = createServerMessage('gameState', { phase: 'playing' });
    expect(msg.type).toBe('gameState');
  });
});
