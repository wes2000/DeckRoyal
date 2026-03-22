import { getCardById } from '@shared/cards';
import type { CardDefinition } from '@shared/cards/types';

export class CardHand {
  private scene: Phaser.Scene;
  private cardContainers: Phaser.GameObjects.Container[] = [];
  private onPlayCard: (cardId: string) => void;
  private lastHandKey = '';
  private lastEnergy = -1;

  constructor(scene: Phaser.Scene, onPlayCard: (cardId: string) => void) {
    this.scene = scene;
    this.onPlayCard = onPlayCard;
  }

  update(hand: string[], energy: number): void {
    const handKey = hand.join(',');
    if (handKey === this.lastHandKey && energy === this.lastEnergy) return;
    this.lastHandKey = handKey;
    this.lastEnergy = energy;

    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];

    const cardWidth = 105;
    const cardHeight = 145;
    const numCards = hand.length;

    // Fan layout parameters
    const centerX = 400;
    const baseY = 555;
    const maxSpread = 380; // total width of fan
    const arcHeight = 25; // how much the arc curves
    const maxAngle = 3; // max rotation in degrees per card from center

    hand.forEach((cardId, i) => {
      const card = getCardById(cardId);
      if (!card) return;

      // Compute fan position
      const t = numCards <= 1 ? 0 : (i / (numCards - 1)) * 2 - 1; // -1 to 1
      const x = centerX + t * (maxSpread / 2);
      const y = baseY + Math.abs(t) * arcHeight; // arc up at edges
      const angle = t * maxAngle;

      const playable = energy >= card.cost;
      const container = this.createCard(x, y, angle, card, playable, cardWidth, cardHeight);
      this.cardContainers.push(container);
    });
  }

  private createCard(
    x: number, y: number, angle: number,
    card: CardDefinition, playable: boolean,
    w: number, h: number,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y)
      .setScrollFactor(0).setDepth(60).setAngle(angle);

    // Card type colors
    const typeColors: Record<string, { bg: number; border: number; label: string }> = {
      attack: { bg: 0x8b2020, border: 0xcc4444, label: 'Attack' },
      skill:  { bg: 0x1a4480, border: 0x4488cc, label: 'Skill' },
      power:  { bg: 0x806020, border: 0xccaa44, label: 'Power' },
    };
    const colors = typeColors[card.type] ?? { bg: 0x444444, border: 0x666666, label: '' };

    // Card background
    const bgColor = playable ? colors.bg : 0x2a2a2a;
    const borderColor = playable ? colors.border : 0x444444;

    // Outer card frame
    const frame = this.scene.add.rectangle(0, 0, w, h, 0x222222)
      .setStrokeStyle(2, borderColor);
    container.add(frame);

    // Inner card bg
    const inner = this.scene.add.rectangle(0, 0, w - 6, h - 6, bgColor);
    container.add(inner);

    // Card art area (darker rectangle in upper portion)
    const artArea = this.scene.add.rectangle(0, -18, w - 14, 55, 0x111111, 0.5)
      .setStrokeStyle(1, 0x333333);
    container.add(artArea);

    // Type icon in art area
    const typeIcons: Record<string, string> = {
      attack: '\u2694', skill: '\u26E8', power: '\u2B50',
    };
    const iconText = this.scene.add.text(0, -20, typeIcons[card.type] ?? '', {
      fontSize: '24px', color: '#ffffff',
    }).setOrigin(0.5).setAlpha(0.3);
    container.add(iconText);

    // Cost orb (top-left)
    const costOrb = this.scene.add.circle(-w / 2 + 14, -h / 2 + 14, 13,
      playable ? 0x2255aa : 0x333333)
      .setStrokeStyle(2, playable ? 0x60a5fa : 0x555555);
    const costText = this.scene.add.text(-w / 2 + 14, -h / 2 + 14, `${card.cost}`, {
      fontSize: '14px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([costOrb, costText]);

    // Card name (center, below art)
    const nameText = this.scene.add.text(0, 15, card.name, {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
      wordWrap: { width: w - 16 },
    }).setOrigin(0.5, 0);
    container.add(nameText);

    // Description (below name)
    const descText = this.scene.add.text(0, 32, card.description, {
      fontSize: '8px', color: '#cccccc', fontFamily: 'monospace',
      wordWrap: { width: w - 16 },
    }).setOrigin(0.5, 0);
    container.add(descText);

    // Type label (bottom)
    const typeLabel = this.scene.add.text(0, h / 2 - 12, colors.label, {
      fontSize: '8px', color: '#999999', fontFamily: 'monospace',
    }).setOrigin(0.5);
    container.add(typeLabel);

    // Upgrade indicator
    if (card.upgraded) {
      const upText = this.scene.add.text(w / 2 - 10, -h / 2 + 8, '+', {
        fontSize: '14px', color: '#4ade80', fontFamily: 'monospace', fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(upText);
    }

    // Interactivity
    if (playable) {
      frame.setInteractive({ useHandCursor: true });
      let hovered = false;
      const origY = y;
      const origAngle = angle;

      frame.on('pointerover', () => {
        if (!hovered) {
          hovered = true;
          container.setScale(1.15);
          container.y = origY - 30;
          container.setAngle(0); // straighten on hover
          container.setDepth(65); // bring to front
        }
      });
      frame.on('pointerout', () => {
        if (hovered) {
          hovered = false;
          container.setScale(1.0);
          container.y = origY;
          container.setAngle(origAngle);
          container.setDepth(60);
        }
      });
      frame.on('pointerdown', () => {
        this.onPlayCard(card.id);
      });
    } else {
      container.setAlpha(0.45);
    }

    return container;
  }

  destroy(): void {
    this.cardContainers.forEach(c => c.destroy());
    this.cardContainers = [];
    this.lastHandKey = '';
    this.lastEnergy = -1;
  }
}
