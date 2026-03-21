# Plan 2: Server & Networking

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the game server — Express HTTP server, WebSocket game state sync, lobby system, game manager, and all server-side game loop logic. After this plan, you can create/join lobbies and play a full game via WebSocket messages (no UI yet — testable with wscat or automated tests).

**Architecture:** The server is a single Node.js process running Express for HTTP (serving static files, lobby creation) and ws for WebSocket (real-time game state). The game manager orchestrates game lifecycle, delegates to the engine modules from Plan 1 for all game logic. Server tick loop runs at 10Hz for movement/zone updates.

**Tech Stack:** Node.js, Express, ws, TypeScript, Vitest

**Spec:** `docs/superpowers/specs/2026-03-21-deckbrawl-design.md`

**Depends on:** Plan 1 (Core Game Logic) must be complete.

---

## File Structure

```
src/
└── server/
    ├── index.ts              # Entry point — starts Express + WebSocket server
    ├── lobby.ts              # Lobby create/join/leave, class selection, host management
    ├── game-manager.ts       # Game lifecycle: lobby→countdown→playing→finished
    ├── game-loop.ts          # Server tick loop: movement, zone updates, timers
    ├── player-handler.ts     # Handles player actions: move, interact with event, combat actions
    ├── combat-handler.ts     # Orchestrates combat flow on server: start, turns, end
    ├── event-handler.ts      # Resolves map events when player walks onto them
    ├── network/
    │   ├── ws-server.ts      # WebSocket server setup, connection management
    │   ├── messages.ts       # Message type definitions (client→server, server→client)
    │   └── connection.ts     # Per-client connection state, send helpers
    └── disconnect-handler.ts # Disconnection timeouts, host migration
tests/
└── server/
    ├── lobby.test.ts
    ├── game-manager.test.ts
    ├── game-loop.test.ts
    ├── player-handler.test.ts
    ├── combat-handler.test.ts
    ├── event-handler.test.ts
    ├── network/
    │   └── messages.test.ts
    └── integration.test.ts
```

---

### Task 1: Message Protocol

**Files:**
- Create: `src/server/network/messages.ts`
- Create: `tests/server/network/messages.test.ts`

- [ ] **Step 1: Write message validation tests**

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write message types and parser**

```typescript
export type Direction = 'up' | 'down' | 'left' | 'right';

export type ClientMessage =
  | { type: 'joinLobby'; name: string; gameId: string }
  | { type: 'selectClass'; class: 'warrior' | 'mage' | 'rogue' }
  | { type: 'startGame' }
  | { type: 'move'; direction: Direction }
  | { type: 'playCard'; cardId: string; targetId?: string }
  | { type: 'endTurn' }
  | { type: 'flee' }
  | { type: 'selectCard'; cardId: string }   // pick reward card
  | { type: 'upgradeCard'; cardId: string }   // blacksmith
  | { type: 'removeCard'; cardId: string };   // shrine of sacrifice

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

export function parseClientMessage(raw: string): ClientMessage | null { ... }
export function isValidClientMessage(msg: unknown): msg is ClientMessage { ... }
export function createServerMessage<T extends ServerMessage['type']>(
  type: T, data: Extract<ServerMessage, { type: T }>['data']
): ServerMessage { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/network/messages.ts tests/server/network/messages.test.ts
git commit -m "feat: define WebSocket message protocol"
```

---

### Task 2: Lobby System

**Files:**
- Create: `src/server/lobby.ts`
- Create: `tests/server/lobby.test.ts`

- [ ] **Step 1: Write lobby tests**

Test cases:
- `createLobby(hostId)` returns a lobby with unique ID and host
- `joinLobby(lobby, playerId, name)` adds player to lobby
- `joinLobby` rejects if lobby is full (8 players)
- `joinLobby` rejects if game already started
- `selectClass(lobby, playerId, class)` updates player's class
- Multiple players can pick same class
- `leaveLobby(lobby, playerId)` removes player
- Host leaving transfers host to next player
- `canStart(lobby)` requires at least 1 player with a class selected
- `getLobbyState(lobby)` returns sanitized state for clients
- Lobby generates 6-char alphanumeric code

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write lobby system**

```typescript
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

export function createLobby(hostId: string, hostName: string): Lobby { ... }
export function joinLobby(lobby: Lobby, playerId: string, name: string): Lobby | { error: string } { ... }
export function selectClass(lobby: Lobby, playerId: string, playerClass: PlayerClass): Lobby | { error: string } { ... }
export function leaveLobby(lobby: Lobby, playerId: string): Lobby { ... }
export function canStart(lobby: Lobby): boolean { ... }
export function getLobbyState(lobby: Lobby): unknown { ... }
function generateCode(): string { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/lobby.ts tests/server/lobby.test.ts
git commit -m "feat: add lobby system with create, join, class selection"
```

---

### Task 3: Game Manager

**Files:**
- Create: `src/server/game-manager.ts`
- Create: `tests/server/game-manager.test.ts`

- [ ] **Step 1: Write game manager tests**

Test cases:
- `initializeGame(lobby)` creates GameState from lobby players
- Players get starter decks based on class
- Map is generated with correct event count for player count
- Players get spawn positions at map edges
- `startCountdown(game)` sets phase to 'countdown'
- `startGame(game)` sets phase to 'playing', starts elapsed timer
- `eliminatePlayer(game, playerId)` sets player.isAlive to false
- `checkWinCondition(game)` returns winner when 1 player alive
- `checkWinCondition` returns null when multiple alive
- Solo mode (1 player): no zone shrinking
- `getPlayerView(game, playerId)` returns sanitized state (hide other players' hands)

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write game manager**

```typescript
import type { GameState, Player } from '@shared/types';
import type { Lobby } from './lobby';
import { generateMap, placeEvents, getSpawnPoints } from '@engine/map-generator';
import { getStarterDeck } from '@shared/cards';
import { createDeck } from '@engine/deck';
import { STARTING_HP } from '@shared/constants';

export function initializeGame(lobby: Lobby): GameState { ... }
export function startCountdown(game: GameState): GameState { ... }
export function startGame(game: GameState): GameState { ... }
export function eliminatePlayer(game: GameState, playerId: string): GameState { ... }
export function checkWinCondition(game: GameState): string | null { ... } // returns winner ID or null
export function getPlayerView(game: GameState, playerId: string): unknown { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/game-manager.ts tests/server/game-manager.test.ts
git commit -m "feat: add game manager with initialization and lifecycle"
```

---

### Task 4: Player Handler

**Files:**
- Create: `src/server/player-handler.ts`
- Create: `tests/server/player-handler.test.ts`

- [ ] **Step 1: Write player handler tests**

Test cases:
- `movePlayer(game, playerId, direction)` updates player position
- Movement blocked by impassable tiles
- Movement blocked by map boundaries
- Movement blocked while in combat
- Movement at 5 tiles/sec (cooldown between moves = 200ms)
- Walking onto event tile triggers event interaction
- Walking onto another player triggers PvP (if not on cooldown)
- Walking onto fighting players bounces to adjacent tile
- PvP cooldown prevents re-engagement for 10 seconds
- Walking onto monster tile triggers PvE combat
- Zone damage applied to players outside zone

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write player handler**

```typescript
import type { GameState } from '@shared/types';
import type { Direction } from './network/messages';

export interface MoveResult {
  game: GameState;
  triggered?: 'event' | 'pvp' | 'pve' | 'bounce';
  eventId?: string;
  combatId?: string;
}

export function movePlayer(game: GameState, playerId: string, direction: Direction, currentTime: number): MoveResult { ... }
export function getNewPosition(x: number, y: number, direction: Direction): { x: number; y: number } { ... }
export function canMove(game: GameState, playerId: string, newX: number, newY: number, currentTime: number): boolean { ... }
export function isOnCooldown(game: GameState, playerId: string, otherId: string, currentTime: number): boolean { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/player-handler.ts tests/server/player-handler.test.ts
git commit -m "feat: add player movement handler with collision and event triggers"
```

---

### Task 5: Combat Handler

**Files:**
- Create: `src/server/combat-handler.ts`
- Create: `tests/server/combat-handler.test.ts`

- [ ] **Step 1: Write combat handler tests**

Test cases:
- `startPvECombat(game, playerId, eventId)` creates combat, transitions player to combat state
- `startPvPCombat(game, initiatorId, targetId)` creates PvP combat
- `handlePlayCard(game, combatId, playerId, cardId)` delegates to combat engine
- `handleEndTurn(game, combatId, playerId)` advances combat turn
- `handleFlee(game, combatId, playerId)` processes flee with 10hp cost
- PvP combat ends after 4 rounds — both players returned to map
- PvP combat sets cooldown between the two players
- PvE combat end grants card reward choices
- Monster death increments player stats
- Player death during combat triggers elimination
- Turn timer: auto-end turn after 30 seconds
- Zone interruption: combat ends if zone overtakes tile

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write combat handler**

```typescript
import type { GameState } from '@shared/types';

export function startPvECombat(game: GameState, playerId: string, eventId: string): GameState { ... }
export function startPvPCombat(game: GameState, initiatorId: string, targetId: string): GameState { ... }
export function handlePlayCard(game: GameState, combatId: string, playerId: string, cardId: string): GameState { ... }
export function handleEndTurn(game: GameState, combatId: string, playerId: string): GameState { ... }
export function handleFlee(game: GameState, combatId: string, playerId: string): GameState { ... }
export function checkTurnTimer(game: GameState, combatId: string, currentTime: number): GameState { ... }
export function handleZoneInterruption(game: GameState, combatId: string): GameState { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/combat-handler.ts tests/server/combat-handler.test.ts
git commit -m "feat: add combat handler for server-side combat orchestration"
```

---

### Task 6: Event Handler

**Files:**
- Create: `src/server/event-handler.ts`
- Create: `tests/server/event-handler.test.ts`

- [ ] **Step 1: Write event handler tests**

Test cases:
- `handleEventInteraction(game, playerId, eventId)` processes event based on type
- Campfire heals player, deactivates event
- Blacksmith prompts card upgrade selection
- Small/rare monster starts PvE combat
- Random event rolls from pool and resolves
- Non-fight events blocked by alternation rule when needsFight is true
- Events already consumed (active=false) are rejected
- Event alternation tracking updates after resolution
- Fight events (monster, PvP) record as fight for alternation

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write event handler**

```typescript
import type { GameState } from '@shared/types';
import { canUseNonFightEvent, recordNonFightEvent, recordFightEvent } from '@engine/event-alternation';
import { resolveCampfire, resolveBlacksmith, resolveRandomEvent } from '@engine/events';

export interface EventInteractionResult {
  game: GameState;
  response: 'healed' | 'upgrade_prompt' | 'combat_started' | 'card_choice' | 'random_resolved' | 'blocked';
  data?: unknown;
}

export function handleEventInteraction(game: GameState, playerId: string, eventId: string): EventInteractionResult { ... }
export function handleCardSelection(game: GameState, playerId: string, cardId: string): GameState { ... }
export function handleUpgradeSelection(game: GameState, playerId: string, cardId: string): GameState { ... }
export function handleCardRemoval(game: GameState, playerId: string, cardId: string): GameState { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/event-handler.ts tests/server/event-handler.test.ts
git commit -m "feat: add event interaction handler with alternation enforcement"
```

---

### Task 7: Game Loop

**Files:**
- Create: `src/server/game-loop.ts`
- Create: `tests/server/game-loop.test.ts`

- [ ] **Step 1: Write game loop tests**

Test cases:
- `tick(game, deltaTime)` advances elapsed time
- Tick updates zone phase when time thresholds are crossed
- Tick applies zone damage to players outside boundary
- Tick destroys events outside zone boundary
- Tick checks turn timers for active combats
- Tick checks for win condition (1 player alive)
- Tick checks for sudden death damage
- Solo mode tick does not shrink zone
- Tick emits zone warning before shrink

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write game loop**

```typescript
import type { GameState } from '@shared/types';
import { getZonePhase, getZoneBoundary, getZoneDamage, destroyEventsOutsideZone, isZoneWarning } from '@engine/zone';
import { checkWinCondition, eliminatePlayer } from './game-manager';

export interface TickResult {
  game: GameState;
  events: GameEvent[];  // things that happened this tick to broadcast
}

export type GameEvent =
  | { type: 'zonePhaseChanged'; phase: number }
  | { type: 'zoneWarning'; nextPhase: number; timeUntil: number }
  | { type: 'playerDamaged'; playerId: string; damage: number; source: 'zone' | 'sudden_death' }
  | { type: 'playerEliminated'; playerId: string }
  | { type: 'eventDestroyed'; eventId: string }
  | { type: 'turnAutoEnded'; combatId: string; playerId: string }
  | { type: 'gameOver'; winnerId: string };

export function tick(game: GameState, deltaTime: number, currentTime: number): TickResult { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/game-loop.ts tests/server/game-loop.test.ts
git commit -m "feat: add server game loop with zone, timers, and win condition"
```

---

### Task 8: WebSocket Server & Connection Management

**Files:**
- Create: `src/server/network/ws-server.ts`
- Create: `src/server/network/connection.ts`

- [ ] **Step 1: Write WebSocket server**

```typescript
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import { parseClientMessage } from './messages';

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

  constructor(server: any, onMessage: Function, onDisconnect: Function) { ... }

  broadcast(gameId: string, message: any): void { ... }
  sendTo(connId: string, message: any): void { ... }
  getConnection(connId: string): ClientConnection | undefined { ... }
}
```

- [ ] **Step 2: Write connection helpers**

```typescript
export function createConnection(ws: WebSocket, id: string): ClientConnection { ... }
export function associateWithGame(conn: ClientConnection, gameId: string, playerId: string): ClientConnection { ... }
```

- [ ] **Step 3: Commit**

```bash
git add src/server/network/ws-server.ts src/server/network/connection.ts
git commit -m "feat: add WebSocket server with connection management"
```

---

### Task 9: Disconnection Handler

**Files:**
- Create: `src/server/disconnect-handler.ts`
- Create: `tests/server/disconnect-handler.test.ts` (Note: this file is listed in the file structure under `tests/server/`)

- [ ] **Step 1: Write disconnect tests**

Test cases:
- Disconnected player in overworld gets 30-second timeout
- Reconnect within 30s resumes player
- Timeout after 30s eliminates player
- Disconnected player in PvP: turns auto-pass
- Disconnected player in PvE: 15-second pause, then eliminated
- Host disconnect transfers host to next player in lobby order

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write disconnect handler**

```typescript
import type { GameState } from '@shared/types';

export interface DisconnectTimer {
  playerId: string;
  disconnectedAt: number;
  timeout: number;  // 30s for overworld, 15s for PvE
  context: 'overworld' | 'pvp' | 'pve';
}

export function handleDisconnect(game: GameState, playerId: string, currentTime: number): { game: GameState; timer: DisconnectTimer } { ... }
export function handleReconnect(game: GameState, playerId: string): GameState { ... }
export function checkDisconnectTimers(game: GameState, timers: DisconnectTimer[], currentTime: number): { game: GameState; expired: string[] } { ... }
export function migrateHost(game: GameState, disconnectedHostId: string): GameState { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/disconnect-handler.ts tests/server/disconnect-handler.test.ts
git commit -m "feat: add disconnection handling with timeouts and host migration"
```

---

### Task 10: Server Entry Point

**Files:**
- Create: `src/server/index.ts`

- [ ] **Step 1: Write server entry point**

```typescript
import express from 'express';
import { createServer } from 'http';
import path from 'path';
import { GameWebSocketServer } from './network/ws-server';
import { createLobby, joinLobby, selectClass, leaveLobby, canStart } from './lobby';
import { initializeGame, startGame, checkWinCondition, getPlayerView } from './game-manager';
import { movePlayer } from './player-handler';
import { handlePlayCard, handleEndTurn, handleFlee, startPvECombat, startPvPCombat } from './combat-handler';
import { handleEventInteraction, handleCardSelection, handleUpgradeSelection, handleCardRemoval } from './event-handler';
import { tick } from './game-loop';

const app = express();
const server = createServer(app);

// Serve static client files
app.use(express.static(path.join(__dirname, '../../public')));

// Game state storage
const lobbies = new Map();
const games = new Map();

// WebSocket setup
const wsServer = new GameWebSocketServer(server, handleMessage, handleDisconnect);

function handleMessage(connId: string, msg: ClientMessage) {
  // Route messages to appropriate handlers based on msg.type
  // joinLobby, selectClass, startGame -> lobby handlers
  // move -> player handler
  // playCard, endTurn, flee -> combat handler
  // selectCard, upgradeCard, removeCard -> event handler
}

// Game loop: 10 ticks per second
setInterval(() => {
  for (const [gameId, game] of games) {
    if (game.phase !== 'playing') continue;
    const result = tick(game, 0.1, Date.now());
    games.set(gameId, result.game);
    // Broadcast events to all players
    for (const event of result.events) {
      wsServer.broadcast(gameId, event);
    }
  }
}, 100);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`DeckBrawl server running on port ${PORT}`));
```

- [ ] **Step 2: Install Express and ws**

```bash
npm install express ws
npm install @types/express @types/ws --save-dev
```

- [ ] **Step 3: Add server start script to package.json**

```json
{
  "scripts": {
    "dev": "npx tsx --watch src/server/index.ts",
    "start": "npx tsx src/server/index.ts"
  }
}
```

- [ ] **Step 4: Verify server starts**

Run: `npm run dev`
Expected: "DeckBrawl server running on port 3000"

- [ ] **Step 5: Commit**

```bash
git add src/server/index.ts package.json package-lock.json
git commit -m "feat: add server entry point with Express and WebSocket routing"
```

---

### Task 11: Server Integration Tests

**Files:**
- Create: `tests/server/integration.test.ts`

- [ ] **Step 1: Write integration tests**

Test a full game flow via function calls (no actual WebSocket connections):
1. Create a lobby
2. Two players join and select classes
3. Host starts game
4. Game initializes with map, events, spawn points
5. Player 1 moves to a small monster event
6. PvE combat starts — play through turns until monster dies
7. Player 1 picks a reward card
8. Player 1 moves to campfire, heals
9. Player 1 moves into Player 2 — PvP starts
10. Play through 4 rounds of PvP
11. Verify damage cap enforced
12. Verify event alternation tracked correctly
13. Zone shrinks, events destroyed
14. Verify elimination and win condition

- [ ] **Step 2: Run integration tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/server/integration.test.ts
git commit -m "feat: add server integration tests for full game flow"
```
