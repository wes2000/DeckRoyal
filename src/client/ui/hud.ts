import { HPBar } from './hp-bar';
import { getCardById } from '@shared/cards';

export class HUD {
  private scene: Phaser.Scene;
  private hpBar: HPBar;
  private nameText: Phaser.GameObjects.Text;
  private classText: Phaser.GameObjects.Text;
  private blockText: Phaser.GameObjects.Text;
  private aliveText: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text;
  private zoneText: Phaser.GameObjects.Text;
  private eventLockText: Phaser.GameObjects.Text;
  private deckBtn: Phaser.GameObjects.Text;
  private deckOverlay: Phaser.GameObjects.GameObject[] = [];
  private currentDeck: string[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Top-left: player info
    this.nameText = scene.add.text(10, 10, '', {
      fontSize: '12px', color: '#e8a838', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(50);

    this.classText = scene.add.text(10, 26, '', {
      fontSize: '10px', color: '#888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(50);

    this.hpBar = new HPBar(scene, 10, 42, 120, 14);

    this.blockText = scene.add.text(10, 60, '', {
      fontSize: '10px', color: '#60a5fa', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(50);

    // Top-right: game info
    this.aliveText = scene.add.text(790, 10, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);

    this.timerText = scene.add.text(790, 28, '', {
      fontSize: '10px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);

    this.zoneText = scene.add.text(790, 44, '', {
      fontSize: '10px', color: '#ef4444', fontFamily: 'monospace',
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(50);

    // Bottom-left: event lock
    this.eventLockText = scene.add.text(10, 580, '', {
      fontSize: '10px', color: '#fbbf24', fontFamily: 'monospace',
    }).setOrigin(0, 1).setScrollFactor(0).setDepth(50);

    // Deck view button
    this.deckBtn = scene.add.text(10, 80, '[ DECK ]', {
      fontSize: '11px', color: '#e8a838', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(50).setInteractive({ useHandCursor: true });
    this.deckBtn.on('pointerover', () => this.deckBtn.setColor('#fcd34d'));
    this.deckBtn.on('pointerout', () => this.deckBtn.setColor('#e8a838'));
    this.deckBtn.on('pointerdown', () => this.toggleDeckView());
  }

  update(gameState: any, myPlayerId: string): void {
    const player = gameState.players[myPlayerId];
    if (!player) return;

    this.nameText.setText(player.name);
    this.classText.setText(player.class?.toUpperCase() ?? '');
    this.hpBar.update(player.hp, player.maxHp);
    this.blockText.setText(player.block > 0 ? `Block: ${player.block}` : '');
    if (player.deck) this.currentDeck = player.deck;

    // Count alive players
    const alivePlayers = Object.values(gameState.players).filter((p: any) => p.isAlive);
    this.aliveText.setText(`Alive: ${alivePlayers.length}`);

    // Timer
    const elapsed = Math.floor(gameState.elapsed);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    this.timerText.setText(`${mins}:${secs.toString().padStart(2, '0')}`);

    // Zone phase
    this.zoneText.setText(`Zone Phase: ${gameState.zonePhase}`);

    // Event lock
    if (player.needsFight) {
      this.eventLockText.setText('Must fight before using events');
    } else {
      const free = player.freeNonFightEvents;
      this.eventLockText.setText(free > 0 ? `Free events: ${free}` : '');
    }
  }

  private toggleDeckView(): void {
    if (this.deckOverlay.length > 0) {
      this.deckOverlay.forEach(el => el.destroy());
      this.deckOverlay = [];
      return;
    }

    const overlay = this.scene.add.rectangle(400, 300, 700, 500, 0x000000, 0.9)
      .setScrollFactor(0).setDepth(90);
    const title = this.scene.add.text(400, 70, `DECK (${this.currentDeck.length} cards)`, {
      fontSize: '16px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91);

    const closeBtn = this.scene.add.text(720, 70, '[ X ]', {
      fontSize: '14px', color: '#ef4444', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(91).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => this.toggleDeckView());

    this.deckOverlay.push(overlay, title, closeBtn);

    // Count cards and display
    const cardCounts = new Map<string, number>();
    for (const id of this.currentDeck) {
      cardCounts.set(id, (cardCounts.get(id) ?? 0) + 1);
    }

    const cols = 4;
    const cardW = 150;
    const cardH = 50;
    const startX = 400 - ((Math.min(cols, cardCounts.size) * (cardW + 10)) / 2) + cardW / 2;
    const startY = 110;

    let i = 0;
    for (const [cardId, count] of cardCounts) {
      const card = getCardById(cardId);
      if (!card) continue;

      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = startX + col * (cardW + 10);
      const y = startY + row * (cardH + 8);

      const typeColor: Record<string, number> = {
        attack: 0xcc3333, skill: 0x3366cc, power: 0xcc9933,
      };

      const bg = this.scene.add.rectangle(x, y, cardW, cardH, typeColor[card.type] ?? 0x444444)
        .setStrokeStyle(1, 0x888888).setScrollFactor(0).setDepth(91);
      const nameText = this.scene.add.text(x, y - 8, `${card.name}${count > 1 ? ` x${count}` : ''}`, {
        fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const costText = this.scene.add.text(x - 65, y - 8, `${card.cost}`, {
        fontSize: '10px', color: '#fbbf24', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(92);
      const descText = this.scene.add.text(x, y + 10, card.description, {
        fontSize: '7px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: cardW - 10 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(92);

      this.deckOverlay.push(bg, nameText, costText, descText);
      i++;
    }
  }

  destroy(): void {
    this.hpBar.destroy();
    this.nameText.destroy();
    this.classText.destroy();
    this.blockText.destroy();
    this.aliveText.destroy();
    this.timerText.destroy();
    this.zoneText.destroy();
    this.eventLockText.destroy();
    this.deckBtn.destroy();
    this.deckOverlay.forEach(el => el.destroy());
    this.deckOverlay = [];
  }
}
