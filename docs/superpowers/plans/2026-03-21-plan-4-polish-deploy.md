# Plan 4: Polish & Deploy

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add spectator mode, victory screen, visual polish (animations, screen effects), disconnection handling in the client, and deploy to Railway. After this plan, the game is live and shareable.

**Architecture:** Builds on the existing client and server. Spectator mode reuses the OverworldScene with a different input mode. Visual effects are Phaser tweens/particles. Deployment uses Railway with a single Dockerfile serving both the API and built client assets.

**Tech Stack:** Phaser 3, Docker, Railway CLI

**Spec:** `docs/superpowers/specs/2026-03-21-deckbrawl-design.md`

**Depends on:** Plan 3 (Client & UI) must be complete.

---

## File Structure

```
src/
├── client/
│   ├── scenes/
│   │   ├── overworld.ts      # Modify: add spectator mode
│   │   └── victory.ts        # Create: victory/stats screen
│   ├── ui/
│   │   ├── kill-feed.ts      # Create: scrolling kill/event feed
│   │   ├── toast.ts          # Create: notification toasts
│   │   └── effects.ts        # Create: visual effects (damage flash, heal sparkle)
│   └── network/
│       └── ws-client.ts      # Modify: handle disconnect/reconnect UI
├── server/
│   └── index.ts              # Modify: serve built client in production
Dockerfile
railway.json
.dockerignore
```

---

### Task 1: Victory Scene

**Files:**
- Create: `src/client/scenes/victory.ts`
- Modify: `src/client/main.ts` (add VictoryScene to config)

- [ ] **Step 1: Create victory scene**

```typescript
export class VictoryScene extends Phaser.Scene {
  constructor() { super('Victory'); }

  create(data: { winnerId: string; winnerName: string; stats: Record<string, any>; isWinner: boolean }) {
    const { winnerName, stats, isWinner } = data;

    // Background overlay
    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8);

    // Winner announcement
    const title = isWinner ? 'VICTORY!' : `${winnerName} WINS!`;
    const color = isWinner ? '#e8a838' : '#aaaaaa';
    this.add.text(400, 80, title, {
      fontSize: '48px', color, fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Stats display
    const statLines = [
      `Damage Dealt: ${stats.damageDealt}`,
      `Cards Played: ${stats.cardsPlayed}`,
      `Monsters Killed: ${stats.monstersKilled}`,
      `Events Claimed: ${stats.eventsClaimed}`,
    ];
    statLines.forEach((line, i) => {
      this.add.text(400, 180 + i * 40, line, {
        fontSize: '18px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);
    });

    // Return to lobby button
    const btn = this.add.rectangle(400, 480, 200, 50, 0xe8a838).setInteractive();
    this.add.text(400, 480, 'RETURN TO LOBBY', {
      fontSize: '16px', color: '#000000', fontFamily: 'monospace',
    }).setOrigin(0.5);

    btn.on('pointerdown', () => {
      this.scene.stop('Overworld');
      this.scene.stop('Combat');
      this.scene.start('Lobby');
    });
  }
}
```

- [ ] **Step 2: Wire up game over handling**

In OverworldScene, listen for `gameOver` message:
```typescript
wsClient.on('gameOver', (msg) => {
  this.scene.launch('Victory', {
    winnerId: msg.data.winnerId,
    winnerName: msg.data.winnerName,
    stats: msg.data.stats,
    isWinner: msg.data.winnerId === this.myPlayerId,
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/victory.ts src/client/main.ts src/client/scenes/overworld.ts
git commit -m "feat: add victory screen with stats and return to lobby"
```

---

### Task 2: Spectator Mode

**Files:**
- Modify: `src/client/scenes/overworld.ts`

- [ ] **Step 1: Add spectator mode to overworld**

When the local player is eliminated, switch to spectator mode:

```typescript
// In OverworldScene
private isSpectating = false;
private spectatingPlayerId: string | null = null;
private spectatorUI!: Phaser.GameObjects.Container;

private enterSpectatorMode() {
  this.isSpectating = true;

  // Disable WASD input
  // Show "SPECTATING" banner
  // Show player selection bar at bottom (click to follow different players)
  // Camera follows selected living player

  this.spectatorUI = this.add.container(0, 0);

  // Banner
  const banner = this.add.text(400, 30, 'SPECTATING', {
    fontSize: '20px', color: '#ff5555', fontFamily: 'monospace',
    backgroundColor: '#000000', padding: { x: 10, y: 5 },
  }).setOrigin(0.5).setScrollFactor(0);
  this.spectatorUI.add(banner);

  // Player buttons along bottom
  this.updateSpectatorButtons();
}

private updateSpectatorButtons() {
  // Create a button for each living player
  // Clicking sets spectatingPlayerId and moves camera to follow them
}

private followPlayer(playerId: string) {
  this.spectatingPlayerId = playerId;
  // Camera lerps to this player's position each frame
}

update(time: number) {
  if (this.isSpectating) {
    // Camera follows spectated player
    if (this.spectatingPlayerId) {
      const sprite = this.playerSprites.get(this.spectatingPlayerId);
      if (sprite) this.cameras.main.centerOn(sprite.x, sprite.y);
    }
    return; // No input processing
  }
  // ... normal movement input
}
```

- [ ] **Step 2: Test spectator mode**

Start a 2-player game, eliminate one player. Verify:
- Dead player sees "SPECTATING" banner
- Can click to follow the other player
- Can watch combat encounters
- No WASD input allowed

- [ ] **Step 3: Commit**

```bash
git add src/client/scenes/overworld.ts
git commit -m "feat: add spectator mode for eliminated players"
```

---

### Task 3: Kill Feed & Notifications

**Files:**
- Create: `src/client/ui/kill-feed.ts`
- Create: `src/client/ui/toast.ts`

- [ ] **Step 1: Create kill feed**

```typescript
export class KillFeed {
  private scene: Phaser.Scene;
  private entries: Phaser.GameObjects.Text[] = [];
  private maxEntries = 5;
  private x: number;
  private y: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }

  addEntry(text: string, color = '#ffffff') {
    // Add new entry at top
    // Slide existing entries down
    // Remove oldest if > maxEntries
    // Fade out after 8 seconds
    const entry = this.scene.add.text(this.x, this.y, text, {
      fontSize: '12px', color, fontFamily: 'monospace',
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setScrollFactor(0).setDepth(100);

    this.entries.unshift(entry);
    this.repositionEntries();

    if (this.entries.length > this.maxEntries) {
      const old = this.entries.pop();
      old?.destroy();
    }

    this.scene.tweens.add({
      targets: entry, alpha: 0, delay: 8000, duration: 1000,
      onComplete: () => {
        const idx = this.entries.indexOf(entry);
        if (idx >= 0) this.entries.splice(idx, 1);
        entry.destroy();
        this.repositionEntries();
      },
    });
  }

  private repositionEntries() {
    this.entries.forEach((e, i) => e.setY(this.y + i * 20));
  }
}
```

- [ ] **Step 2: Create toast notifications**

```typescript
export class Toast {
  static show(scene: Phaser.Scene, message: string, duration = 2000) {
    const text = scene.add.text(400, 200, message, {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
      backgroundColor: '#333333', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

    scene.tweens.add({
      targets: text, y: 180, alpha: 0, duration: 500,
      delay: duration, onComplete: () => text.destroy(),
    });
  }
}
```

- [ ] **Step 3: Integrate into OverworldScene**

Add kill feed at top-right corner. Feed events:
- "Player1 defeated Goblin"
- "Player1 claimed Campfire"
- "Player2 eliminated Player3"
- "Zone shrinking!"

- [ ] **Step 4: Commit**

```bash
git add src/client/ui/kill-feed.ts src/client/ui/toast.ts src/client/scenes/overworld.ts
git commit -m "feat: add kill feed and toast notifications"
```

---

### Task 4: Visual Effects

**Files:**
- Create: `src/client/ui/effects.ts`

- [ ] **Step 1: Create visual effects module**

```typescript
export class Effects {
  static damageFlash(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
    // Brief red tint on sprite
    scene.tweens.add({
      targets: sprite, tint: 0xff0000, duration: 100, yoyo: true,
    });
  }

  static healSparkle(scene: Phaser.Scene, x: number, y: number) {
    // Green particles floating up
    const particles = scene.add.particles(x, y, 'tiles', {
      frame: 0, // green tile
      scale: { start: 0.3, end: 0 },
      alpha: { start: 1, end: 0 },
      speed: { min: 20, max: 50 },
      angle: { min: -120, max: -60 },
      lifespan: 800,
      quantity: 5,
      tint: 0x44aa44,
    });
    scene.time.delayedCall(1000, () => particles.destroy());
  }

  static attackAnimation(scene: Phaser.Scene, attacker: Phaser.GameObjects.Sprite, target: Phaser.GameObjects.Sprite) {
    // Quick lunge toward target and back
    const origX = attacker.x;
    const origY = attacker.y;
    scene.tweens.add({
      targets: attacker,
      x: target.x, y: target.y,
      duration: 100, yoyo: true,
      onYoyo: () => Effects.damageFlash(scene, target),
    });
  }

  static blockAnimation(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
    // Brief blue shield flash
    scene.tweens.add({
      targets: sprite, tint: 0x5dadec, duration: 150, yoyo: true,
    });
  }

  static eliminationEffect(scene: Phaser.Scene, x: number, y: number) {
    // Sprite fades out and shrinks
    // Skull emoji or red X appears briefly
  }

  static zoneWarningPulse(scene: Phaser.Scene) {
    // Screen edges pulse red
    const overlay = scene.add.rectangle(400, 300, 800, 600, 0xff0000, 0)
      .setScrollFactor(0).setDepth(50);
    scene.tweens.add({
      targets: overlay, alpha: 0.15, duration: 500,
      yoyo: true, repeat: 2,
      onComplete: () => overlay.destroy(),
    });
  }
}
```

- [ ] **Step 2: Integrate effects into combat and overworld scenes**

- Combat: attack animation on card play, block animation on defend, damage flash on hit
- Overworld: heal sparkle at campfire, elimination effect, zone warning pulse

- [ ] **Step 3: Commit**

```bash
git add src/client/ui/effects.ts src/client/scenes/combat.ts src/client/scenes/overworld.ts
git commit -m "feat: add visual effects for combat, healing, and zone warnings"
```

---

### Task 5: Client Disconnect/Reconnect UI

**Files:**
- Modify: `src/client/network/ws-client.ts`
- Modify: `src/client/scenes/overworld.ts`

- [ ] **Step 1: Add connection status UI**

When WebSocket disconnects:
- Show "Connection lost — reconnecting..." overlay
- Show reconnect countdown
- On successful reconnect, dismiss overlay and request full game state

```typescript
// In WSClient, add events:
// 'disconnected' — fired on close
// 'reconnecting' — fired on each attempt
// 'reconnected' — fired on successful reconnect

// In OverworldScene:
private connectionOverlay?: Phaser.GameObjects.Container;

private showDisconnectOverlay() {
  this.connectionOverlay = this.add.container(0, 0).setScrollFactor(0).setDepth(1000);
  const bg = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
  const text = this.add.text(400, 300, 'Connection lost\nReconnecting...', {
    fontSize: '24px', color: '#ff5555', fontFamily: 'monospace', align: 'center',
  }).setOrigin(0.5);
  this.connectionOverlay.add([bg, text]);
}

private hideDisconnectOverlay() {
  this.connectionOverlay?.destroy();
  this.connectionOverlay = undefined;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/client/network/ws-client.ts src/client/scenes/overworld.ts
git commit -m "feat: add disconnect/reconnect UI overlay"
```

---

### Task 6: Production Server Setup

**Files:**
- Modify: `src/server/index.ts`
- Modify: `package.json`

- [ ] **Step 1: Serve built client in production**

```typescript
// In src/server/index.ts, after Express setup:
import path from 'path';

if (process.env.NODE_ENV === 'production') {
  // Serve Vite-built client files
  app.use(express.static(path.join(__dirname, '../../dist')));

  // SPA fallback — serve index.html for all non-API routes
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api')) {
      res.sendFile(path.join(__dirname, '../../dist/index.html'));
    }
  });
}
```

- [ ] **Step 2: Add build script**

```json
{
  "scripts": {
    "build": "vite build && tsc --project tsconfig.server.json",
    "start": "NODE_ENV=production node dist/server/index.js"
  }
}
```

Create `tsconfig.server.json`:
```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/shared/**/*", "src/engine/**/*", "src/server/**/*"]
}
```

- [ ] **Step 3: Test production build locally**

```bash
npm run build
npm start
```
Expected: Server starts, serves client at http://localhost:3000

- [ ] **Step 4: Commit**

```bash
git add src/server/index.ts package.json tsconfig.server.json
git commit -m "feat: production build setup with Vite client and compiled server"
```

---

### Task 7: Docker Setup

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

```dockerfile
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "dist/server/index.js"]
```

- [ ] **Step 2: Create .dockerignore**

```
node_modules
dist
.git
.superpowers
tests
docs
*.md
```

- [ ] **Step 3: Test Docker build locally**

```bash
docker build -t deckbrawl .
docker run -p 3000:3000 deckbrawl
```
Expected: Game accessible at http://localhost:3000

- [ ] **Step 4: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Docker setup for production deployment"
```

---

### Task 8: Railway Deployment

**Files:**
- Create: `railway.json`

- [ ] **Step 1: Create railway.json**

```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "Dockerfile"
  },
  "deploy": {
    "healthcheckPath": "/",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 3
  }
}
```

- [ ] **Step 2: Initialize Railway project**

```bash
# Install Railway CLI if needed
npm install -g @railway/cli

# Login and initialize
railway login
railway init
```

- [ ] **Step 3: Set up GitHub repo and push**

```bash
git remote add origin https://github.com/wes2000/DeckRoyal.git
git branch -M main
git push -u origin main
```

- [ ] **Step 4: Connect Railway to GitHub**

In Railway dashboard:
1. Create new project from GitHub repo
2. Railway auto-detects the Dockerfile
3. Set environment variable: `PORT=3000`
4. Deploy

- [ ] **Step 5: Verify deployment**

Open the Railway-provided URL in browser. Create a lobby, join from another device, play a full game.

- [ ] **Step 6: Commit**

```bash
git add railway.json
git commit -m "feat: add Railway deployment configuration"
git push
```

---

### Task 9: Final Play Test

**Files:** None — testing only

- [ ] **Step 1: Solo mode test**

Open deployed URL, create game, start with 1 player. Verify:
- Map generates with 8 events
- No zone shrinking
- Can fight monsters, use campfire, blacksmith
- Event alternation enforced
- Game ends when all events consumed

- [ ] **Step 2: 2-player test**

Open in two browsers/devices. Verify:
- Lobby create/join works
- Both see tilemap and each other
- PvP combat triggers on collision
- Damage cap enforced
- Zone shrinks on schedule
- Elimination and spectator mode work
- Winner sees victory screen
- Return to lobby works

- [ ] **Step 3: Stress test (4+ players)**

Get 4 friends or open 4 browser tabs. Verify:
- Lobby holds multiple players
- All players visible on map
- Multiple simultaneous events/combats
- Zone shrinking forces encounters
- Game ends within ~15-20 minutes
- No server crashes or desyncs

- [ ] **Step 4: Fix any issues, commit, push, redeploy**

```bash
git add -A
git commit -m "fix: address issues from final play testing"
git push
```
