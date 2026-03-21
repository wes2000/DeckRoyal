import { getCardById } from '@shared/cards';
import type { CardDefinition } from '@shared/cards/types';

export class CardHand {
  private scene: Phaser.Scene;
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private onPlayCard: (cardId: string) => void;

  constructor(scene: Phaser.Scene, onPlayCard: (cardId: string) => void) {
    this.scene = scene;
    this.onPlayCard = onPlayCard;
  }

  update(hand: string[], energy: number): void {
    // Destroy old cards
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];

    const cardWidth = 100;
    const cardHeight = 140;
    const spacing = 10;
    const totalWidth = hand.length * (cardWidth + spacing) - spacing;
    const startX = (800 - totalWidth) / 2 + cardWidth / 2;
    const y = 520;

    hand.forEach((cardId, i) => {
      const card = getCardById(cardId);
      if (!card) return;

      const x = startX + i * (cardWidth + spacing);
      const playable = energy >= card.cost;
      const container = this.createCard(x, y, card, playable);
      this.cardContainers.push(container);
    });
  }

  private createCard(x: number, y: number, card: CardDefinition, playable: boolean): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y).setScrollFactor(0).setDepth(60);

    // Card background
    const typeColor: Record<string, number> = {
      attack: 0xcc3333, skill: 0x3366cc, power: 0xcc9933,
    };
    const bgColor = playable ? (typeColor[card.type] ?? 0x444444) : 0x333333;
    const bg = this.scene.add.rectangle(0, 0, 100, 140, bgColor).setStrokeStyle(2, playable ? 0xffffff : 0x555555);
    container.add(bg);

    // Cost (top-left)
    const costBg = this.scene.add.circle(-38, -58, 12, 0x2255aa);
    const costText = this.scene.add.text(-38, -58, `${card.cost}`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add([costBg, costText]);

    // Name
    const nameText = this.scene.add.text(0, -35, card.name, {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
      wordWrap: { width: 90 },
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Description
    const descText = this.scene.add.text(0, 0, card.description, {
      fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
      wordWrap: { width: 88 },
    }).setOrigin(0.5, 0);
    container.add(descText);

    // Upgraded indicator
    if (card.upgraded) {
      const upText = this.scene.add.text(38, -58, '+', {
        fontSize: '12px', color: '#4ade80', fontFamily: 'monospace',
      }).setOrigin(0.5);
      container.add(upText);
    }

    // Interactive
    if (playable) {
      bg.setInteractive({ useHandCursor: true });
      bg.on('pointerover', () => {
        container.setScale(1.1);
        container.y -= 10;
      });
      bg.on('pointerout', () => {
        container.setScale(1.0);
        container.y += 10;
      });
      bg.on('pointerdown', () => {
        this.onPlayCard(card.id);
      });
    } else {
      container.setAlpha(0.5);
    }

    return container;
  }

  destroy(): void {
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];
  }
}
