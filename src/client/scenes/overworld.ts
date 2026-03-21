import { wsClient } from '../network/ws-client';
import { HUD } from '../ui/hud';
import { Minimap } from '../ui/minimap';

const TILE_SIZE = 16;
const TILE_MAP: Record<string, number> = { grass: 0, path: 1, rock: 2, water: 3 };
const EVENT_FRAME: Record<string, number> = { campfire: 0, blacksmith: 1, small_monster: 2, rare_monster: 3, random: 4 };

export class OverworldScene extends Phaser.Scene {
  private hud!: HUD;
  private minimap!: Minimap;
  private mapCreated = false;
  private playerSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private eventSprites = new Map<string, Phaser.GameObjects.Sprite>();
  private myPlayerId: string | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private lastMoveTime = 0;
  private moveInterval = 200;
  private zoneOverlay!: Phaser.GameObjects.Graphics;
  private lastZoneBoundary: { minX: number; minY: number; maxX: number; maxY: number } | null = null;

  constructor() { super('Overworld'); }

  create() {
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey('W'),
      A: this.input.keyboard!.addKey('A'),
      S: this.input.keyboard!.addKey('S'),
      D: this.input.keyboard!.addKey('D'),
    };

    this.hud = new HUD(this);
    this.minimap = new Minimap(this);

    this.zoneOverlay = this.add.graphics().setDepth(3);

    wsClient.on('zoneWarning', (msg) => {
      this.flashZoneWarning();
    });

    wsClient.on('gameState', (msg) => this.handleGameState(msg.data));
    wsClient.on('combatState', (msg) => {
      if (!this.scene.isActive('Combat')) {
        this.scene.launch('Combat', { combatData: msg.data });
      }
    });
    wsClient.on('playerEliminated', (msg) => this.handleElimination(msg.data));
    wsClient.on('gameOver', (msg) => this.handleGameOver(msg.data));
  }

  update(time: number) {
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
    if (!this.myPlayerId) {
      for (const [id, player] of Object.entries(data.players)) {
        if (Array.isArray((player as any).hand)) {
          this.myPlayerId = id;
          break;
        }
      }
    }

    if (!this.mapCreated && data.map) {
      this.createTilemap(data.map);
      this.mapCreated = true;
    }

    this.updatePlayers(data.players);
    this.updateEvents(data.events);

    if (data.zoneBoundary && data.map) {
      this.updateZoneVisuals(data.zoneBoundary, data.map.width, data.map.height);
    }

    if (this.myPlayerId) {
      this.hud.update(data, this.myPlayerId);
      this.minimap.setMyPlayerId(this.myPlayerId);
      this.minimap.update(data);
    }
  }

  private createTilemap(mapData: any) {
    const map = this.make.tilemap({
      tileWidth: TILE_SIZE, tileHeight: TILE_SIZE,
      width: mapData.width, height: mapData.height,
    });
    const tileset = map.addTilesetImage('tiles', 'tiles', TILE_SIZE, TILE_SIZE)!;
    const layer = map.createBlankLayer('ground', tileset)!;

    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const tileType = mapData.tiles[y][x].type;
        layer.putTileAt(TILE_MAP[tileType] ?? 0, x, y);
      }
    }

    this.cameras.main.setBounds(0, 0, mapData.width * TILE_SIZE, mapData.height * TILE_SIZE);
  }

  private updatePlayers(players: Record<string, any>) {
    const activeIds = new Set<string>();

    for (const [id, player] of Object.entries(players)) {
      if (!player.isAlive) continue;
      activeIds.add(id);

      const worldX = player.position.x * TILE_SIZE + TILE_SIZE / 2;
      const worldY = player.position.y * TILE_SIZE + TILE_SIZE / 2;

      let sprite = this.playerSprites.get(id);
      if (!sprite) {
        sprite = this.add.sprite(worldX, worldY, 'player', 0);
        sprite.setDepth(10);
        if (id !== this.myPlayerId) {
          sprite.setTint(0xff6666);
        }
        this.playerSprites.set(id, sprite);

        const label = this.add.text(worldX, worldY - 12, player.name, {
          fontSize: '8px', color: '#ffffff', fontFamily: 'monospace',
        }).setOrigin(0.5).setDepth(11);
        this.playerLabels.set(id, label);
      }

      sprite.setPosition(worldX, worldY);
      this.playerLabels.get(id)?.setPosition(worldX, worldY - 12);

      if (id === this.myPlayerId) {
        this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
      }
    }

    for (const [id, sprite] of this.playerSprites) {
      if (!activeIds.has(id)) {
        sprite.destroy();
        this.playerSprites.delete(id);
        this.playerLabels.get(id)?.destroy();
        this.playerLabels.delete(id);
      }
    }
  }

  private updateEvents(events: any[]) {
    const activeEventIds = new Set<string>();

    for (const evt of events) {
      if (!evt.active) continue;
      activeEventIds.add(evt.id);

      if (!this.eventSprites.has(evt.id)) {
        const worldX = evt.position.x * TILE_SIZE + TILE_SIZE / 2;
        const worldY = evt.position.y * TILE_SIZE + TILE_SIZE / 2;
        const frame = EVENT_FRAME[evt.type] ?? 4;
        const sprite = this.add.sprite(worldX, worldY, 'events', frame).setDepth(5);
        this.eventSprites.set(evt.id, sprite);
      }
    }

    for (const [id, sprite] of this.eventSprites) {
      if (!activeEventIds.has(id)) {
        sprite.destroy();
        this.eventSprites.delete(id);
      }
    }
  }

  private updateZoneVisuals(zoneBoundary: any, mapWidth: number, mapHeight: number) {
    const lb = this.lastZoneBoundary;
    if (lb &&
        lb.minX === zoneBoundary.minX && lb.minY === zoneBoundary.minY &&
        lb.maxX === zoneBoundary.maxX && lb.maxY === zoneBoundary.maxY) {
      return;
    }
    this.lastZoneBoundary = { ...zoneBoundary };

    this.zoneOverlay.clear();
    this.zoneOverlay.fillStyle(0xff0000, 0.25);

    for (let y = 0; y < mapHeight; y++) {
      for (let x = 0; x < mapWidth; x++) {
        if (x < zoneBoundary.minX || x > zoneBoundary.maxX ||
            y < zoneBoundary.minY || y > zoneBoundary.maxY) {
          this.zoneOverlay.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
  }

  private flashZoneWarning() {
    // Flash screen border red briefly
    const flash = this.add.rectangle(400, 300, 800, 600, 0xff0000, 0.3)
      .setScrollFactor(0).setDepth(90);
    this.tweens.add({
      targets: flash,
      alpha: 0,
      duration: 1000,
      repeat: 2,
      yoyo: true,
      onComplete: () => flash.destroy(),
    });
  }

  private handleElimination(data: any) {
    const { playerId } = data;
    const sprite = this.playerSprites.get(playerId);
    if (sprite) { sprite.destroy(); this.playerSprites.delete(playerId); }
    const label = this.playerLabels.get(playerId);
    if (label) { label.destroy(); this.playerLabels.delete(playerId); }

    if (playerId === this.myPlayerId) {
      this.add.text(400, 300, 'ELIMINATED', {
        fontSize: '32px', color: '#ef4444', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
    }
  }

  private handleGameOver(data: any) {
    const isWinner = data.winnerId === this.myPlayerId;
    const text = isWinner ? 'VICTORY!' : 'GAME OVER';
    const color = isWinner ? '#4ade80' : '#ef4444';
    this.add.text(400, 300, text, {
      fontSize: '40px', color, fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
  }
}
