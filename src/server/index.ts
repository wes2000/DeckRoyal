import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { GameWebSocketServer } from './network/ws-server.js';
import {
  createLobby,
  joinLobby,
  selectClass,
  leaveLobby,
  canStart,
  getLobbyState,
} from './lobby.js';
import type { Lobby } from './lobby.js';
import {
  initializeGame,
  startGame,
  checkWinCondition,
  getPlayerView,
} from './game-manager.js';
import { movePlayer } from './player-handler.js';
import {
  handlePlayCard,
  handleEndTurn,
  handleFlee,
  startPvECombat,
  startPvPCombat,
} from './combat-handler.js';
import {
  handleEventInteraction,
  handleCardSelection,
  handleUpgradeSelection,
  handleCardRemoval,
} from './event-handler.js';
import { handleDisconnect as handleDisconnectTimer } from './disconnect-handler.js';
import { tick } from './game-loop.js';
import type { ClientMessage } from './network/messages.js';
import type { GameState } from '@shared/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = createServer(app);

// Serve static client files
if (process.env.NODE_ENV === 'production') {
  // In production, __dirname is dist/ (where server.js is bundled to).
  // Vite also builds client files into dist/, so serve from the same dir.
  app.use(express.static(__dirname));

  // SPA fallback — let the client router handle non-API routes
  app.get('/{*splat}', (req, res) => {
    if (!req.path.startsWith('/api') && !req.path.startsWith('/ws')) {
      res.sendFile(path.join(__dirname, 'index.html'));
    }
  });
} else {
  app.use(express.static(path.join(__dirname, '../../public')));
}

// ---------------------------------------------------------------------------
// Game state storage
// ---------------------------------------------------------------------------

// Maps lobby code -> Lobby
const lobbies = new Map<string, Lobby>();
// Maps game id -> GameState
const games = new Map<string, GameState>();

// Connection -> lobby/game binding
const connToLobbyCode = new Map<string, string>();   // connId -> lobbyCode
const connToPlayerId = new Map<string, string>();     // connId -> playerId
const connToGameId = new Map<string, string>();       // connId -> gameId
const playerIdToConnId = new Map<string, string>();   // playerId -> connId
const playerIdToGameId = new Map<string, string>();   // playerId -> gameId

// ---------------------------------------------------------------------------
// WebSocket setup
// ---------------------------------------------------------------------------

const wsServer = new GameWebSocketServer(server, handleMessage, handleDisconnect);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function broadcastLobbyState(lobbyCode: string, lobby: Lobby): void {
  const state = getLobbyState(lobby);
  for (const [connId, code] of connToLobbyCode) {
    if (code === lobbyCode) {
      wsServer.sendTo(connId, { type: 'lobbyState', data: state });
    }
  }
}

function broadcastGameState(gameId: string, game: GameState): void {
  for (const [playerId, gId] of playerIdToGameId) {
    if (gId !== gameId) continue;
    const connId = playerIdToConnId.get(playerId);
    if (!connId) continue;
    const view = getPlayerView(game, playerId);
    wsServer.sendTo(connId, { type: 'gameState', data: view });
  }
}

function sendError(connId: string, message: string): void {
  wsServer.sendTo(connId, { type: 'error', data: { message } });
}

// ---------------------------------------------------------------------------
// handleMessage — routes incoming WebSocket messages to appropriate handlers
// ---------------------------------------------------------------------------

function handleMessage(connId: string, msg: ClientMessage): void {
  switch (msg.type) {
    // ── joinLobby ──────────────────────────────────────────────────────────
    case 'joinLobby': {
      const { name, gameId: requestedCode } = msg;

      let lobby: Lobby;
      let playerId: string;

      // Use a stable playerId tied to this connection
      playerId = connToPlayerId.get(connId) ?? crypto.randomUUID();

      if (!requestedCode || requestedCode === 'new') {
        // Create a new lobby — this player is the host
        lobby = createLobby(playerId, name);
        lobbies.set(lobby.code, lobby);
      } else {
        const existing = lobbies.get(requestedCode.toUpperCase());
        if (!existing) {
          sendError(connId, `Lobby not found: ${requestedCode}`);
          return;
        }
        const result = joinLobby(existing, playerId, name);
        if ('error' in result) {
          sendError(connId, result.error);
          return;
        }
        lobby = result;
        lobbies.set(lobby.code, lobby);
      }

      // Associate connection
      connToPlayerId.set(connId, playerId);
      connToLobbyCode.set(connId, lobby.code);
      playerIdToConnId.set(playerId, connId);

      // Update ws-server connection metadata
      const conn = wsServer.getConnection(connId);
      if (conn) {
        conn.playerId = playerId;
        conn.gameId = lobby.code;
      }

      broadcastLobbyState(lobby.code, lobby);
      break;
    }

    // ── selectClass ────────────────────────────────────────────────────────
    case 'selectClass': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a lobby'); return; }

      const lobbyCode = connToLobbyCode.get(connId);
      if (!lobbyCode) { sendError(connId, 'Not in a lobby'); return; }

      const lobby = lobbies.get(lobbyCode);
      if (!lobby) { sendError(connId, 'Lobby not found'); return; }

      const result = selectClass(lobby, playerId, msg.class);
      if ('error' in result) {
        sendError(connId, result.error);
        return;
      }

      lobbies.set(lobbyCode, result);
      broadcastLobbyState(lobbyCode, result);
      break;
    }

    // ── startGame ──────────────────────────────────────────────────────────
    case 'startGame': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a lobby'); return; }

      const lobbyCode = connToLobbyCode.get(connId);
      if (!lobbyCode) { sendError(connId, 'Not in a lobby'); return; }

      const lobby = lobbies.get(lobbyCode);
      if (!lobby) { sendError(connId, 'Lobby not found'); return; }

      if (lobby.hostId !== playerId) {
        sendError(connId, 'Only the host can start the game');
        return;
      }

      if (!canStart(lobby)) {
        sendError(connId, 'Cannot start: not enough players have selected a class');
        return;
      }

      // Initialize and start the game
      const initialGame = initializeGame(lobby);
      const game = startGame(initialGame);
      games.set(game.id, game);

      // Associate all lobby players with this game
      for (const [pId] of lobby.players) {
        playerIdToGameId.set(pId, game.id);
      }

      // Update ws-server connection gameId for all players in this lobby
      for (const [cId, code] of connToLobbyCode) {
        if (code === lobbyCode) {
          const pId = connToPlayerId.get(cId);
          if (pId) {
            connToGameId.set(cId, game.id);
            const conn = wsServer.getConnection(cId);
            if (conn) conn.gameId = game.id;
          }
        }
      }

      // Mark lobby as started
      lobbies.set(lobbyCode, { ...lobby, started: true });

      broadcastGameState(game.id, game);
      break;
    }

    // ── move ───────────────────────────────────────────────────────────────
    case 'move': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      if (game.phase !== 'playing') {
        sendError(connId, 'Game is not in playing phase');
        return;
      }

      const now = Date.now();
      const moveResult = movePlayer(game, playerId, msg.direction, now);
      game = moveResult.game;

      if (moveResult.triggered === 'event' && moveResult.eventId) {
        const eventResult = handleEventInteraction(game, playerId, moveResult.eventId);
        game = eventResult.game;

        // Notify the player of the event result
        wsServer.sendTo(connId, { type: 'eventResult', data: { response: eventResult.response, ...eventResult.data as object } });
      } else if (moveResult.triggered === 'pve' && moveResult.eventId) {
        game = startPvECombat(game, playerId, moveResult.eventId);
        const combat = Object.values(game.combats).find(
          c => !c.isComplete && c.playerIds.includes(playerId)
        );
        if (combat) {
          wsServer.sendTo(connId, { type: 'combatState', data: combat });
        }
      } else if (moveResult.triggered === 'pvp') {
        // Find the other player at the same position
        const player = game.players[playerId];
        if (player) {
          const target = Object.values(game.players).find(
            p => p.id !== playerId && p.isAlive &&
              p.position.x === player.position.x &&
              p.position.y === player.position.y
          );
          if (target) {
            game = startPvPCombat(game, playerId, target.id);
            const combat = Object.values(game.combats).find(
              c => !c.isComplete && c.playerIds.includes(playerId) && c.playerIds.includes(target.id)
            );
            if (combat) {
              wsServer.broadcast(gameId, { type: 'combatState', data: combat });
            }
          }
        }
      }

      games.set(gameId, game);

      // Check win condition
      const winnerId = checkWinCondition(game);
      if (winnerId) {
        wsServer.broadcast(gameId, { type: 'gameOver', data: { winnerId, stats: game.players[winnerId]?.stats } });
      }

      broadcastGameState(gameId, game);
      break;
    }

    // ── playCard ───────────────────────────────────────────────────────────
    case 'playCard': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      // Find the combat this player is in
      const combat = Object.values(game.combats).find(
        c => !c.isComplete && c.playerIds.includes(playerId)
      );
      if (!combat) { sendError(connId, 'Not in combat'); return; }

      game = handlePlayCard(game, combat.id, playerId, msg.cardId);
      games.set(gameId, game);

      wsServer.broadcast(gameId, { type: 'combatState', data: game.combats[combat.id] });
      broadcastGameState(gameId, game);
      break;
    }

    // ── endTurn ────────────────────────────────────────────────────────────
    case 'endTurn': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      const combat = Object.values(game.combats).find(
        c => !c.isComplete && c.playerIds.includes(playerId)
      );
      if (!combat) { sendError(connId, 'Not in combat'); return; }

      game = handleEndTurn(game, combat.id, playerId);
      games.set(gameId, game);

      wsServer.broadcast(gameId, { type: 'combatState', data: game.combats[combat.id] });
      broadcastGameState(gameId, game);
      break;
    }

    // ── flee ───────────────────────────────────────────────────────────────
    case 'flee': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      const combat = Object.values(game.combats).find(
        c => !c.isComplete && c.playerIds.includes(playerId)
      );
      if (!combat) { sendError(connId, 'Not in combat'); return; }

      game = handleFlee(game, combat.id, playerId);
      games.set(gameId, game);

      wsServer.broadcast(gameId, { type: 'combatState', data: game.combats[combat.id] });

      const winnerId = checkWinCondition(game);
      if (winnerId) {
        wsServer.broadcast(gameId, { type: 'gameOver', data: { winnerId, stats: game.players[winnerId]?.stats } });
      }

      broadcastGameState(gameId, game);
      break;
    }

    // ── selectCard ─────────────────────────────────────────────────────────
    case 'selectCard': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      game = handleCardSelection(game, playerId, msg.cardId);
      games.set(gameId, game);

      broadcastGameState(gameId, game);
      break;
    }

    // ── upgradeCard ────────────────────────────────────────────────────────
    case 'upgradeCard': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      game = handleUpgradeSelection(game, playerId, msg.cardId);
      games.set(gameId, game);

      broadcastGameState(gameId, game);
      break;
    }

    // ── removeCard ─────────────────────────────────────────────────────────
    case 'removeCard': {
      const playerId = connToPlayerId.get(connId);
      if (!playerId) { sendError(connId, 'Not in a game'); return; }

      const gameId = playerIdToGameId.get(playerId);
      if (!gameId) { sendError(connId, 'Not in a game'); return; }

      let game = games.get(gameId);
      if (!game) { sendError(connId, 'Game not found'); return; }

      game = handleCardRemoval(game, playerId, msg.cardId);
      games.set(gameId, game);

      broadcastGameState(gameId, game);
      break;
    }

    default: {
      sendError(connId, 'Unknown message type');
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// handleDisconnect
// ---------------------------------------------------------------------------

function handleDisconnect(connId: string): void {
  const playerId = connToPlayerId.get(connId);
  if (!playerId) return;

  const gameId = playerIdToGameId.get(playerId);
  if (gameId) {
    const game = games.get(gameId);
    if (game && game.phase === 'playing') {
      const { game: updatedGame } = handleDisconnectTimer(game, playerId, Date.now());
      games.set(gameId, updatedGame);
    }
  }

  // Also handle lobby disconnect
  const lobbyCode = connToLobbyCode.get(connId);
  if (lobbyCode) {
    const lobby = lobbies.get(lobbyCode);
    if (lobby && !lobby.started) {
      const updatedLobby = leaveLobby(lobby, playerId);
      if (updatedLobby.players.size === 0) {
        lobbies.delete(lobbyCode);
      } else {
        lobbies.set(lobbyCode, updatedLobby);
        broadcastLobbyState(lobbyCode, updatedLobby);
      }
    }
  }

  // Clean up connection mappings
  connToPlayerId.delete(connId);
  connToLobbyCode.delete(connId);
  connToGameId.delete(connId);
  playerIdToConnId.delete(playerId);
}

// ---------------------------------------------------------------------------
// Game loop: 10 ticks per second
// ---------------------------------------------------------------------------

setInterval(() => {
  for (const [gameId, game] of games) {
    if (game.phase !== 'playing') continue;
    const result = tick(game, 0.1, Date.now());
    games.set(gameId, result.game);
    for (const event of result.events) {
      wsServer.broadcast(gameId, event);
    }
    // Broadcast updated game state after tick
    broadcastGameState(gameId, result.game);
  }
}, 100);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

const PORT = process.env.PORT ?? 3000;
server.listen(PORT, () => console.log(`DeckBrawl server running on port ${PORT}`));

export { app, server };
