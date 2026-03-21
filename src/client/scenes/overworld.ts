import { wsClient } from '../network/ws-client';
import { HUD } from '../ui/hud';
import { KillFeed } from '../ui/kill-feed';
import { Minimap } from '../ui/minimap';
import { Toast } from '../ui/toast';
import { getCardById } from '@shared/cards';

const TILE_SIZE = 16;
const TILE_MAP: Record<string, number> = { grass: 1, path: 2, rock: 3, water: 4 };
const EVENT_FRAME: Record<string, number> = { campfire: 0, blacksmith: 1, small_monster: 2, rare_monster: 3, random: 4 };

export class OverworldScene extends Phaser.Scene {
  private hud!: HUD;
  private killFeed!: KillFeed;
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
  private isSpectating = false;
  private spectatingPlayerId: string | null = null;
  private spectatorUI: Phaser.GameObjects.GameObject[] = [];
  private connectionOverlay?: Phaser.GameObjects.Container;

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
    this.killFeed = new KillFeed(this, 790, 70);
    this.minimap = new Minimap(this);

    this.zoneOverlay = this.add.graphics().setDepth(3);

    wsClient.onStatus('disconnected', () => this.showDisconnectOverlay());
    wsClient.onStatus('reconnected', () => this.hideDisconnectOverlay());

    wsClient.on('zoneWarning', (msg) => {
      this.flashZoneWarning();
      this.killFeed.addEntry('Zone shrinking!', '#fbbf24');
    });

    wsClient.on('gameState', (msg) => this.handleGameState(msg.data));
    wsClient.on('combatState', (msg) => {
      if (!this.scene.isActive('Combat')) {
        this.scene.launch('Combat', { combatData: msg.data });
      }
    });
    wsClient.on('playerEliminated', (msg) => this.handleElimination(msg.data));
    wsClient.on('gameOver', (msg) => this.handleGameOver(msg.data));
    wsClient.on('eventResult', (msg) => this.showEventUI(msg.data));
  }

  update(time: number) {
    if (this.isSpectating) return;
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

    if (this.isSpectating) {
      this.updateSpectatorButtons();
    }

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
      this.enterSpectatorMode();
    }

    const killerName = data.killedBy ?? 'the zone';
    this.killFeed.addEntry(`${data.playerName ?? 'Player'} eliminated by ${killerName}`, '#ef4444');
  }

  private enterSpectatorMode() {
    this.isSpectating = true;

    const banner = this.add.text(400, 30, 'SPECTATING', {
      fontSize: '20px', color: '#ff5555', fontFamily: 'monospace',
      backgroundColor: '#000000aa', padding: { x: 10, y: 5 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(80);
    this.spectatorUI.push(banner);

    const hint = this.add.text(400, 570, 'Click a player name to follow', {
      fontSize: '12px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(80);
    this.spectatorUI.push(hint);

    this.updateSpectatorButtons();
  }

  private updateSpectatorButtons() {
    // Remove old buttons (index 2 onward) — keep banner (0) and hint (1)
    while (this.spectatorUI.length > 2) {
      const btn = this.spectatorUI.pop();
      if (btn) btn.destroy();
    }

    const alivePlayers = [...this.playerSprites.keys()];

    // Auto-follow first alive player if none selected or previously-followed player is gone
    if (alivePlayers.length > 0 && (!this.spectatingPlayerId || !this.playerSprites.has(this.spectatingPlayerId))) {
      this.followPlayer(alivePlayers[0]);
    }

    const totalWidth = 800;
    const btnWidth = alivePlayers.length > 0 ? Math.min(160, totalWidth / alivePlayers.length) : 160;
    const startX = totalWidth / 2 - ((alivePlayers.length - 1) * btnWidth) / 2;

    alivePlayers.forEach((playerId, i) => {
      const isFollowed = playerId === this.spectatingPlayerId;
      const label = this.playerLabels.get(playerId)?.text || playerId;
      const x = startX + i * btnWidth;

      const btn = this.add.text(x, 545, label, {
        fontSize: '12px',
        color: isFollowed ? '#ffffff' : '#aaaaaa',
        fontFamily: 'monospace',
        backgroundColor: isFollowed ? '#333333aa' : '#00000088',
        padding: { x: 6, y: 4 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(80).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => this.followPlayer(playerId));
      btn.on('pointerover', () => btn.setColor('#ffffff'));
      btn.on('pointerout', () => btn.setColor(isFollowed ? '#ffffff' : '#aaaaaa'));

      this.spectatorUI.push(btn);
    });
  }

  private followPlayer(playerId: string) {
    this.spectatingPlayerId = playerId;
    const sprite = this.playerSprites.get(playerId);
    if (sprite) {
      this.cameras.main.startFollow(sprite, true, 0.1, 0.1);
    }
  }

  private showDisconnectOverlay() {
    if (this.connectionOverlay) return;
    this.connectionOverlay = this.add.container(0, 0).setScrollFactor(0).setDepth(1000);
    const bg = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.7);
    const text = this.add.text(400, 280, 'Connection Lost', {
      fontSize: '24px', color: '#ef4444', fontFamily: 'monospace',
    }).setOrigin(0.5);
    const sub = this.add.text(400, 320, 'Reconnecting...', {
      fontSize: '14px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.connectionOverlay.add([bg, text, sub]);
  }

  private hideDisconnectOverlay() {
    this.connectionOverlay?.destroy();
    this.connectionOverlay = undefined;
  }

  private handleGameOver(data: any) {
    const isWinner = data.winnerId === this.myPlayerId;
    // Get winner name from player sprites/state
    this.scene.launch('Victory', {
      winnerId: data.winnerId,
      winnerName: data.winnerName ?? 'Unknown',
      stats: data.stats ?? {},
      isWinner,
    });
  }

  private showEventUI(data: any) {
    switch (data.response) {
      case 'healed':
        this.showToast(data.message || 'Healed!', '#4ade80');
        this.killFeed.addEntry(data.message || 'Healed!', '#4ade80');
        break;
      case 'upgrade_prompt':
        this.showUpgradePrompt(data.deck);
        break;
      case 'card_choice':
        this.showCardChoice(data.cardChoices, data.message);
        break;
      case 'random_resolved':
        this.showToast(data.message || 'Random event!', '#8b5cf6');
        break;
      case 'blocked':
        this.showToast('Must complete a fight first!', '#ef4444');
        break;
    }
  }

  private showToast(message: string, color = '#ffffff') {
    Toast.show(this, message, color);
  }

  private showUpgradePrompt(deck: string[]) {
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(80);

    const title = this.add.text(400, 40, 'BLACKSMITH - Choose a card to upgrade', {
      fontSize: '16px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, title];

    const uniqueCards = [...new Set(deck)];
    const cols = 5;
    const cardW = 120;
    const cardH = 60;
    const startX = 400 - ((Math.min(cols, uniqueCards.length) * (cardW + 10)) / 2) + cardW / 2;
    const startY = 100;

    uniqueCards.forEach((cardId, i) => {
      const card = getCardById(cardId);
      if (!card || card.upgraded) return;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + 10);
      const y = startY + row * (cardH + 10);

      const bg = this.add.rectangle(x, y, cardW, cardH, 0x333333)
        .setStrokeStyle(1, 0xe8a838).setScrollFactor(0).setDepth(81)
        .setInteractive({ useHandCursor: true });

      const nameText = this.add.text(x, y - 10, card.name, {
        fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(82);

      const descText = this.add.text(x, y + 10, `Cost: ${card.cost}`, {
        fontSize: '8px', color: '#888', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(82);

      elements.push(bg, nameText, descText);

      bg.on('pointerdown', () => {
        wsClient.send({ type: 'upgradeCard', cardId });
        elements.forEach(el => el.destroy());
        this.showToast('Card upgraded!', '#4ade80');
      });

      bg.on('pointerover', () => bg.setStrokeStyle(2, 0xfbbf24));
      bg.on('pointerout', () => bg.setStrokeStyle(1, 0xe8a838));
    });

    const cancelBtn = this.add.text(400, 560, '[ CANCEL ]', {
      fontSize: '14px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81)
      .setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerdown', () => elements.forEach(el => el.destroy()));
    elements.push(cancelBtn);
  }

  private showCardChoice(cardChoices: string[], message?: string) {
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.85)
      .setScrollFactor(0).setDepth(80);

    const title = this.add.text(400, 80, message || 'Choose a card to add', {
      fontSize: '14px', color: '#e8a838', fontFamily: 'monospace',
      wordWrap: { width: 600 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81);

    const elements: Phaser.GameObjects.GameObject[] = [overlay, title];

    cardChoices.forEach((cardId, i) => {
      const card = getCardById(cardId);
      if (!card) return;

      const x = 200 + i * 200;
      const y = 280;

      const bg = this.add.rectangle(x, y, 150, 200, 0x444444)
        .setStrokeStyle(2, 0xe8a838).setScrollFactor(0).setDepth(81)
        .setInteractive({ useHandCursor: true });

      const costText = this.add.text(x - 60, y - 85, `${card.cost}`, {
        fontSize: '14px', color: '#fbbf24', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(82);

      const nameText = this.add.text(x, y - 60, card.name, {
        fontSize: '11px', color: '#ffffff', fontFamily: 'monospace',
        wordWrap: { width: 130 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(82);

      const descText = this.add.text(x, y - 20, card.description, {
        fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 130 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(82);

      elements.push(bg, costText, nameText, descText);

      bg.on('pointerdown', () => {
        wsClient.send({ type: 'selectCard', cardId });
        elements.forEach(el => el.destroy());
        this.showToast(`Added ${card.name} to deck`, '#4ade80');
      });

      bg.on('pointerover', () => bg.setStrokeStyle(2, 0xfbbf24));
      bg.on('pointerout', () => bg.setStrokeStyle(2, 0xe8a838));
    });

    const skipBtn = this.add.text(400, 480, '[ SKIP ]', {
      fontSize: '14px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(81)
      .setInteractive({ useHandCursor: true });
    skipBtn.on('pointerdown', () => elements.forEach(el => el.destroy()));
    elements.push(skipBtn);
  }
}
