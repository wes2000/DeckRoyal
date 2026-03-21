# Plan 3: Client & UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phaser.js game client — lobby UI, overworld with tilemap and player sprites, combat UI with card hand, HUD, minimap, and WebSocket integration. After this plan, the game is playable in a browser.

**Architecture:** The client is a Phaser 3 game with three scenes: LobbyScene, OverworldScene, and CombatScene. A WebSocket client module manages server communication. UI elements (HUD, minimap, card hand) are Phaser GameObjects layered on top of game scenes. All game state comes from the server — the client only renders and sends inputs.

**Tech Stack:** Phaser 3, TypeScript, Vite (bundler), WebSocket API

**Spec:** `docs/superpowers/specs/2026-03-21-deckbrawl-design.md`

**Depends on:** Plan 2 (Server & Networking) must be complete.

---

## File Structure

```
src/
└── client/
    ├── main.ts               # Phaser game config and launch
    ├── network/
    │   └── ws-client.ts      # WebSocket client — connect, send, receive, reconnect
    ├── scenes/
    │   ├── boot.ts           # Preload assets (sprites, tilesets, fonts)
    │   ├── lobby.ts          # Lobby scene — DOM-based UI for create/join/class select
    │   ├── overworld.ts      # Main gameplay — tilemap, player sprites, WASD, events
    │   └── combat.ts         # Combat scene — card hand, enemy, HP bars, energy
    ├── ui/
    │   ├── hud.ts            # Overworld HUD — HP, timer, zone countdown, event lock
    │   ├── minimap.ts        # Minimap — player dots, zone boundary, events
    │   ├── card-hand.ts      # Combat card display — clickable cards with cost/name/effect
    │   ├── hp-bar.ts         # Reusable HP bar component
    │   └── combat-ui.ts      # Combat HUD — energy, block, draw/discard counts, end turn
    └── assets/
        ├── tileset.png       # 16x16 pixel art tileset (grass, path, rock, water)
        ├── player.png        # Player sprite sheet (4 directions, 2 frames each)
        ├── events.png        # Event sprites (campfire, blacksmith, monster, ?, etc.)
        └── ui.png            # UI elements (card frame, buttons, icons)
public/
└── index.html              # Entry HTML — loads Vite bundle
```

---

### Task 1: Client Build Setup

**Files:**
- Create: `public/index.html`
- Create: `src/client/main.ts`
- Modify: `package.json` (add Vite + Phaser dependencies)

- [ ] **Step 1: Install client dependencies**

```bash
npm install phaser
npm install vite --save-dev
```

- [ ] **Step 2: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DeckBrawl</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #111; overflow: hidden; }
    #game-container { width: 100vw; height: 100vh; }
  </style>
</head>
<body>
  <div id="game-container"></div>
  <script type="module" src="/src/client/main.ts"></script>
</body>
</html>
```

- [ ] **Step 3: Create Phaser game config**

```typescript
import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { LobbyScene } from './scenes/lobby';
import { OverworldScene } from './scenes/overworld';
import { CombatScene } from './scenes/combat';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  pixelArt: true,       // nearest-neighbor scaling
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LobbyScene, OverworldScene, CombatScene],
  backgroundColor: '#111111',
};

new Phaser.Game(config);
```

- [ ] **Step 4: Create stub scenes**

Create `src/client/scenes/boot.ts`:
```typescript
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    // Will load assets here
  }
  create() {
    this.scene.start('Lobby');
  }
}
```

Create `src/client/scenes/lobby.ts`:
```typescript
export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }
  create() {
    this.add.text(400, 300, 'DECKBRAWL', { fontSize: '32px', color: '#e8a838' }).setOrigin(0.5);
  }
}
```

Create `src/client/scenes/overworld.ts`:
```typescript
export class OverworldScene extends Phaser.Scene {
  constructor() { super('Overworld'); }
  create() {}
}
```

Create `src/client/scenes/combat.ts`:
```typescript
export class CombatScene extends Phaser.Scene {
  constructor() { super('Combat'); }
  create() {}
}
```

- [ ] **Step 5: Add Vite scripts to package.json**

```json
{
  "scripts": {
    "client:dev": "vite",
    "client:build": "vite build"
  }
}
```

- [ ] **Step 6: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@engine': path.resolve(__dirname, 'src/engine'),
      '@client': path.resolve(__dirname, 'src/client'),
    },
  },
  server: {
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
});
```

- [ ] **Step 7: Verify client starts**

Run: `npm run client:dev`
Expected: Vite dev server starts, browser shows "DECKBRAWL" text on black background.

- [ ] **Step 8: Commit**

```bash
git add public/index.html src/client/main.ts src/client/scenes/ vite.config.ts package.json package-lock.json
git commit -m "feat: client scaffolding with Phaser 3 and Vite"
```

---

### Task 2: Placeholder Pixel Art Assets

**Files:**
- Create: `src/client/assets/tileset.png`
- Create: `src/client/assets/player.png`
- Create: `src/client/assets/events.png`

- [ ] **Step 1: Create placeholder tileset**

Generate a simple 16×16 pixel art tileset programmatically or use a placeholder:
- 4 tiles in a row: grass (green), path (tan), rock (gray), water (blue)
- Total image: 64×16 pixels
- Use a canvas script or simple image editor

Alternatively, create a script `scripts/generate-placeholders.ts` that generates placeholder PNGs using the `canvas` npm package:
```bash
npm install canvas --save-dev
```

The script should generate:
- `tileset.png`: 64×16 (4 tiles × 16px each)
- `player.png`: 128×64 (8 frames: 4 directions × 2 animation frames, each 16×16)
- `events.png`: 80×16 (5 event types × 16px each: campfire, blacksmith, small monster, rare monster, random)

- [ ] **Step 2: Run the asset generator**

```bash
npx tsx scripts/generate-placeholders.ts
```
Expected: PNG files created in `src/client/assets/`

- [ ] **Step 3: Commit**

```bash
git add src/client/assets/ scripts/generate-placeholders.ts
git commit -m "feat: add placeholder pixel art assets"
```

---

### Task 3: Boot Scene — Asset Loading

**Files:**
- Modify: `src/client/scenes/boot.ts`

- [ ] **Step 1: Load assets in boot scene**

```typescript
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // Show loading progress
    const bar = this.add.rectangle(400, 310, 0, 20, 0xe8a838);
    this.load.on('progress', (value: number) => {
      bar.width = 300 * value;
    });

    // Load tileset
    this.load.image('tiles', 'src/client/assets/tileset.png');

    // Load player spritesheet
    this.load.spritesheet('player', 'src/client/assets/player.png', {
      frameWidth: 16, frameHeight: 16,
    });

    // Load event sprites
    this.load.spritesheet('events', 'src/client/assets/events.png', {
      frameWidth: 16, frameHeight: 16,
    });
  }

  create() {
    // Create player walk animations
    const directions = ['down', 'up', 'left', 'right'];
    directions.forEach((dir, i) => {
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers('player', { start: i * 2, end: i * 2 + 1 }),
        frameRate: 6,
        repeat: -1,
      });
    });

    this.scene.start('Lobby');
  }
}
```

- [ ] **Step 2: Verify assets load**

Run: `npm run client:dev`
Expected: Loading bar appears briefly, then lobby screen shows.

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/boot.ts
git commit -m "feat: load pixel art assets in boot scene"
```

---

### Task 4: WebSocket Client

**Files:**
- Create: `src/client/network/ws-client.ts`

- [ ] **Step 1: Write WebSocket client**

```typescript
import type { ClientMessage, ServerMessage } from '../../server/network/messages';

type MessageHandler = (msg: ServerMessage) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private handlers: Map<string, MessageHandler[]> = new Map();
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;

  constructor(url?: string) {
    // Default to current host
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
        // Also fire 'any' handlers
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
```

- [ ] **Step 2: Commit**

```bash
git add src/client/network/ws-client.ts
git commit -m "feat: add WebSocket client with reconnection support"
```

---

### Task 5: Lobby Scene

**Files:**
- Modify: `src/client/scenes/lobby.ts`

- [ ] **Step 1: Build lobby UI**

The lobby uses Phaser DOM elements for form inputs (name, class selection) and game objects for the player list and start button:

```typescript
import { wsClient } from '@client/network/ws-client';
import type { PlayerClass } from '@shared/types';

export class LobbyScene extends Phaser.Scene {
  private playerList: Phaser.GameObjects.Text[] = [];
  private selectedClass: PlayerClass = 'warrior';
  private isHost = false;
  private gameId: string | null = null;

  constructor() { super('Lobby'); }

  create() {
    // Title
    this.add.text(400, 50, 'DECKBRAWL', {
      fontSize: '32px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Check URL for game code: /game/ABC123
    const pathMatch = window.location.pathname.match(/\/game\/(\w+)/);

    if (pathMatch) {
      this.gameId = pathMatch[1];
      this.showJoinUI();
    } else {
      this.showCreateUI();
    }

    // Listen for server messages
    wsClient.on('lobbyState', (msg) => this.updateLobbyDisplay(msg.data));
    wsClient.on('countdown', () => this.scene.start('Overworld'));
  }

  private showCreateUI() {
    // "Create Game" button
    // Name input
    // On create: connect WS, send createLobby, show lobby code
  }

  private showJoinUI() {
    // Name input
    // On join: connect WS, send joinLobby with gameId
  }

  private showLobbyUI() {
    // Player list with class indicators
    // Class selection buttons (Warrior / Mage / Rogue)
    // Start Game button (host only)
    // Lobby code display
  }

  private updateLobbyDisplay(data: any) {
    // Update player list from server state
  }
}
```

Implementation details:
- Create/Join flow sends WebSocket messages to server
- Class selection buttons highlight selected class, send `selectClass` message
- Player list updates reactively from `lobbyState` server messages
- Start button only visible to host, sends `startGame` message
- On `countdown` message, transition to OverworldScene

- [ ] **Step 2: Test lobby manually**

Run server: `npm run dev`
Run client: `npm run client:dev`
Open browser, create a game, verify lobby code appears.
Open second tab, join with the code, verify both players appear.

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/lobby.ts
git commit -m "feat: add lobby scene with create, join, and class selection"
```

---

### Task 6: Overworld Scene — Tilemap & Player

**Files:**
- Modify: `src/client/scenes/overworld.ts`

- [ ] **Step 1: Render tilemap from server state**

```typescript
import { wsClient } from '@client/network/ws-client';

export class OverworldScene extends Phaser.Scene {
  private tilemap!: Phaser.Tilemaps.Tilemap;
  private playerSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private eventSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private myPlayerId!: string;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastMoveTime = 0;
  private moveInterval = 200; // 5 tiles/sec = 200ms between moves

  constructor() { super('Overworld'); }

  create() {
    // Setup keyboard input
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    };

    // Listen for game state updates
    wsClient.on('gameState', (msg) => this.handleGameState(msg.data));
    wsClient.on('combatState', () => this.scene.launch('Combat'));
    wsClient.on('playerEliminated', (msg) => this.handleElimination(msg.data));
  }

  update(time: number) {
    // Handle WASD/arrow input
    if (time - this.lastMoveTime < this.moveInterval) return;

    let direction: string | null = null;
    if (this.wasd.W.isDown || this.cursors.up.isDown) direction = 'up';
    else if (this.wasd.S.isDown || this.cursors.down.isDown) direction = 'down';
    else if (this.wasd.A.isDown || this.cursors.left.isDown) direction = 'left';
    else if (this.wasd.D.isDown || this.cursors.right.isDown) direction = 'right';

    if (direction) {
      wsClient.send({ type: 'move', direction: direction as any });
      this.lastMoveTime = time;
    }
  }

  private handleGameState(data: any) {
    // Update/create tilemap from data.map
    // Update/create player sprites from data.players
    // Update/create event sprites from data.events
    // Update camera to follow local player
    // Update zone boundary visualization
  }

  private handleElimination(data: any) {
    // Remove eliminated player sprite
    // If it's us, switch to spectator mode
  }
}
```

Key implementation details:
- Build tilemap from server's `GameMap` data on first state update
- Use Phaser tilemap layers for terrain
- Player sprites: colored circles with player label, walk animation
- Event sprites: appropriate icon for each event type, disappear when active=false
- Camera follows local player with smooth lerp
- Zone boundary: red-tinted overlay outside safe zone

- [ ] **Step 2: Test overworld rendering**

Start server and client, create lobby, start game, verify:
- Tilemap renders
- Player sprite appears at spawn
- WASD moves player (server validates)
- Other players visible

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/overworld.ts
git commit -m "feat: add overworld scene with tilemap, players, and WASD movement"
```

---

### Task 7: Overworld HUD

**Files:**
- Create: `src/client/ui/hp-bar.ts`
- Create: `src/client/ui/hud.ts`

- [ ] **Step 1: Create reusable HP bar**

```typescript
export class HPBar {
  private bar: Phaser.GameObjects.Graphics;
  private background: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number) { ... }

  update(current: number, max: number): void {
    // Draw background (dark), then fill bar proportionally
    // Color: green > 50%, yellow > 25%, red <= 25%
  }

  setPosition(x: number, y: number): void { ... }
  destroy(): void { ... }
}
```

- [ ] **Step 2: Create HUD overlay**

```typescript
export class HUD {
  private scene: Phaser.Scene;
  private hpBar: HPBar;
  private playerInfo: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text;
  private zoneText: Phaser.GameObjects.Text;
  private aliveText: Phaser.GameObjects.Text;
  private eventLockText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    // Top-left: player info + HP bar
    // Top-right: timer, zone countdown, players alive
    // Bottom-left: event lock status
    // All elements use setScrollFactor(0) to stay fixed on screen
  }

  update(gameState: any): void {
    // Update all HUD elements from game state
  }
}
```

- [ ] **Step 3: Integrate HUD into OverworldScene**

Add `this.hud = new HUD(this)` in OverworldScene.create(), call `this.hud.update(data)` in handleGameState.

- [ ] **Step 4: Commit**

```bash
git add src/client/ui/hp-bar.ts src/client/ui/hud.ts src/client/scenes/overworld.ts
git commit -m "feat: add overworld HUD with HP, timer, zone countdown, event lock"
```

---

### Task 8: Minimap

**Files:**
- Create: `src/client/ui/minimap.ts`

- [ ] **Step 1: Create minimap**

```typescript
export class Minimap {
  private container: Phaser.GameObjects.Container;
  private background: Phaser.GameObjects.Rectangle;
  private playerDots: Map<string, Phaser.GameObjects.Arc> = new Map();
  private eventDots: Map<string, Phaser.GameObjects.Arc> = new Map();
  private zoneBorder: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, size: number) {
    // Fixed position bottom-right, dark background
    // Scale map coordinates to minimap coordinates
    // setScrollFactor(0) for all elements
  }

  update(gameState: any): void {
    // Update player dot positions (color-coded per player)
    // Update event dots (color-coded per type)
    // Update zone boundary rectangle
    // Remove dots for eliminated players / consumed events
  }

  private mapToMinimap(mapX: number, mapY: number, mapWidth: number, mapHeight: number): { x: number; y: number } {
    // Scale world coordinates to minimap pixel coordinates
  }
}
```

- [ ] **Step 2: Integrate minimap into OverworldScene**

- [ ] **Step 3: Commit**

```bash
git add src/client/ui/minimap.ts src/client/scenes/overworld.ts
git commit -m "feat: add minimap with player dots, events, and zone boundary"
```

---

### Task 9: Zone Visualization

**Files:**
- Modify: `src/client/scenes/overworld.ts`

- [ ] **Step 1: Add zone boundary rendering**

In OverworldScene, add zone visualization:
- Red semi-transparent overlay on tiles outside the safe zone
- Flashing border effect during zone warning phase
- Screen edge red tint when player is near boundary
- Update each tick based on server's zoneBoundary data

```typescript
// In OverworldScene
private zoneOverlay!: Phaser.GameObjects.Graphics;
private screenTint!: Phaser.GameObjects.Rectangle;

private updateZoneVisuals(zoneBoundary: ZoneBoundary, mapWidth: number, mapHeight: number) {
  this.zoneOverlay.clear();
  this.zoneOverlay.fillStyle(0xff0000, 0.3);

  // Draw red overlay on all tiles outside zone
  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      if (x < zoneBoundary.minX || x > zoneBoundary.maxX ||
          y < zoneBoundary.minY || y > zoneBoundary.maxY) {
        this.zoneOverlay.fillRect(x * 16, y * 16, 16, 16);
      }
    }
  }
}

private updateScreenTint(playerPos: Position, zoneBoundary: ZoneBoundary) {
  // Show red tint on screen edges when player is within 5 tiles of zone boundary
}
```

- [ ] **Step 2: Test zone visuals**

Start a game, wait for zone to shrink, verify red overlay appears.

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/overworld.ts
git commit -m "feat: add zone boundary visualization with red overlay and screen tint"
```

---

### Task 10: Combat Scene

**Files:**
- Modify: `src/client/scenes/combat.ts`
- Create: `src/client/ui/card-hand.ts`
- Create: `src/client/ui/combat-ui.ts`

- [ ] **Step 1: Build card hand component**

```typescript
export class CardHand {
  private scene: Phaser.Scene;
  private cards: CardSprite[] = [];

  constructor(scene: Phaser.Scene) { ... }

  update(hand: string[], energy: number): void {
    // Rebuild card display from hand card IDs
    // Each card: rectangle with border, cost in top-right, name, description
    // Cards that cost more than current energy are dimmed
    // Click handler sends playCard message
  }
}

class CardSprite {
  private container: Phaser.GameObjects.Container;
  // Card background rectangle (colored border based on card type)
  // Cost text (top-right corner)
  // Name text
  // Description text (small)
  // Click zone with interactive handler

  constructor(scene: Phaser.Scene, x: number, y: number, cardDef: CardDefinition, playable: boolean) { ... }

  setPlayable(playable: boolean): void {
    // Dim or brighten card based on whether player can afford it
  }
}
```

- [ ] **Step 2: Build combat UI overlay**

```typescript
export class CombatUI {
  private scene: Phaser.Scene;
  private enemyHpBar: HPBar;
  private playerHpBar: HPBar;
  private energyText: Phaser.GameObjects.Text;
  private blockText: Phaser.GameObjects.Text;
  private drawPileText: Phaser.GameObjects.Text;
  private discardPileText: Phaser.GameObjects.Text;
  private intentText: Phaser.GameObjects.Text;
  private endTurnButton: Phaser.GameObjects.Container;
  private turnTimerBar: Phaser.GameObjects.Rectangle;
  private fleeButton?: Phaser.GameObjects.Container; // PvE only, after turn 1

  constructor(scene: Phaser.Scene) {
    // Top center: enemy sprite + HP bar + intent (PvE) or opponent info (PvP)
    // Bottom-left: player HP + block
    // Bottom-right: energy display + end turn button
    // Bottom: card hand area (managed by CardHand)
    // Top-right: turn timer bar (30 sec countdown)
  }

  update(combatState: any, playerState: any): void { ... }
}
```

- [ ] **Step 3: Wire up combat scene**

```typescript
export class CombatScene extends Phaser.Scene {
  private cardHand!: CardHand;
  private combatUI!: CombatUI;
  private combatId: string | null = null;

  constructor() { super('Combat'); }

  create() {
    this.cardHand = new CardHand(this);
    this.combatUI = new CombatUI(this);

    wsClient.on('combatState', (msg) => this.handleCombatState(msg.data));
    wsClient.on('cardChoice', (msg) => this.showCardChoice(msg.data));
  }

  private handleCombatState(data: any) {
    if (data.isComplete) {
      this.scene.stop('Combat');
      return;
    }
    this.combatUI.update(data, data.playerState);
    this.cardHand.update(data.hand, data.energy);
  }

  private showCardChoice(data: any) {
    // Show 3 card options for reward selection
    // Click sends selectCard message
  }
}
```

- [ ] **Step 4: Test combat flow**

Start game, walk into a monster, verify:
- Combat scene overlays on overworld
- Cards display in hand with costs
- Clicking a card sends playCard to server
- Enemy HP bar and intent update
- End turn button works
- Combat ends and returns to overworld

- [ ] **Step 5: Commit**

```bash
git add src/client/scenes/combat.ts src/client/ui/card-hand.ts src/client/ui/combat-ui.ts
git commit -m "feat: add combat scene with card hand, HP bars, and turn controls"
```

---

### Task 11: Event Interaction UI

**Files:**
- Modify: `src/client/scenes/overworld.ts`

- [ ] **Step 1: Add event interaction prompts**

When server sends an `eventResult` message, show appropriate UI:
- **Campfire:** Brief heal animation overlay, HP bar animates up, auto-dismiss
- **Blacksmith:** Card grid showing all cards in deck, click one to upgrade. Show upgraded version preview. Send `upgradeCard` message.
- **Card reward (after monster fight):** 3 card options displayed, click to pick. Send `selectCard` message.
- **Random event:** Text description of event outcome, action button if choice needed.
- **Locked event:** Brief "Must fight first" notification toast

```typescript
// In OverworldScene
private showEventUI(eventResult: any) {
  switch (eventResult.type) {
    case 'healed':
      this.showHealAnimation(eventResult.amount);
      break;
    case 'upgrade_prompt':
      this.showUpgradePrompt(eventResult.deck);
      break;
    case 'card_choice':
      this.showCardChoice(eventResult.cards);
      break;
    case 'random_resolved':
      this.showRandomEventResult(eventResult.event);
      break;
    case 'blocked':
      this.showToast('Must complete a fight first!');
      break;
  }
}
```

- [ ] **Step 2: Test event interactions**

Walk onto campfire, verify heal animation. Walk onto blacksmith, verify upgrade prompt. Fight monster, verify card choice.

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/overworld.ts
git commit -m "feat: add event interaction UI for campfire, blacksmith, and card rewards"
```

---

### Task 12: End-to-End Play Test

**Files:** None new — testing existing code

- [ ] **Step 1: Start server and client**

```bash
# Terminal 1
npm run dev

# Terminal 2
npm run client:dev
```

- [ ] **Step 2: Test full game flow**

1. Open browser, create a lobby
2. Open second tab, join lobby with code
3. Both players select classes
4. Host starts game
5. Both players see tilemap, their sprites, and each other
6. Navigate to events with WASD
7. Fight a small monster — play cards, end turns
8. Pick reward card
9. Use campfire to heal
10. Walk into other player — PvP combat starts
11. Play through PvP rounds
12. Zone shrinks visually
13. Continue until one player eliminated
14. Winner sees victory screen

- [ ] **Step 3: Fix any issues found**

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: address issues from end-to-end play test"
```
