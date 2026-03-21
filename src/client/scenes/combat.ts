import { getCardById } from '@shared/cards';
import { wsClient } from '../network/ws-client';
import { CardHand } from '../ui/card-hand';
import { CombatUI } from '../ui/combat-ui';

export class CombatScene extends Phaser.Scene {
  private cardHand!: CardHand;
  private combatUI!: CombatUI;
  private latestCombatState: any = null;
  private latestPlayerState: any = null;
  private myPlayerId: string | null = null;

  constructor() { super('Combat'); }

  create(data: any) {
    // Initial combat data passed from overworld
    if (data?.combatData) {
      this.latestCombatState = data.combatData;
    }

    this.cardHand = new CardHand(this, (cardId) => {
      wsClient.send({ type: 'playCard', cardId });
    });

    this.combatUI = new CombatUI(
      this,
      () => wsClient.send({ type: 'endTurn' }),
      () => wsClient.send({ type: 'flee' }),
    );

    // Listen for combat updates
    wsClient.on('combatState', (msg) => this.handleCombatState((msg as any).data));
    wsClient.on('gameState', (msg) => this.handleGameState((msg as any).data));
    wsClient.on('cardChoice', (msg) => this.showCardChoice((msg as any).data));
  }

  private handleCombatState(data: any) {
    this.latestCombatState = data;

    if (data.isComplete) {
      // Combat ended — clean up and return to overworld
      this.cleanupAndStop();
      return;
    }

    this.combatUI.update(data, this.latestPlayerState);
  }

  private handleGameState(data: any) {
    // Determine our player ID
    if (!this.myPlayerId) {
      for (const [id, player] of Object.entries(data.players)) {
        if (Array.isArray((player as any).hand)) {
          this.myPlayerId = id;
          break;
        }
      }
    }

    if (this.myPlayerId) {
      this.latestPlayerState = data.players[this.myPlayerId];

      // Update card hand with current hand and a generous energy value
      // (Energy is managed server-side; server validates plays)
      if (this.latestPlayerState?.hand && Array.isArray(this.latestPlayerState.hand)) {
        this.cardHand.update(this.latestPlayerState.hand, 99);
      }

      this.combatUI.update(this.latestCombatState, this.latestPlayerState);
    }
  }

  private showCardChoice(data: any) {
    // Show card reward selection (after monster defeat)
    const cards = data.cards as string[];
    if (!cards || cards.length === 0) return;

    // Create card choice overlay
    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(70);

    const title = this.add.text(400, 100, 'Choose a Card', {
      fontSize: '24px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71);

    // Skip button
    const skipBtn = this.add.text(400, 500, '[ SKIP ]', {
      fontSize: '16px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });

    const choiceElements: Phaser.GameObjects.GameObject[] = [overlay, title, skipBtn];

    const cleanup = () => choiceElements.forEach(el => el.destroy());

    skipBtn.on('pointerdown', () => cleanup());

    // Display card options
    cards.forEach((cardId: string, i: number) => {
      const card = getCardById(cardId);
      if (!card) return;

      const x = 200 + i * 200;

      const cardBg = this.add.rectangle(x, 300, 150, 200, 0x444444)
        .setStrokeStyle(2, 0xe8a838).setScrollFactor(0).setDepth(71)
        .setInteractive({ useHandCursor: true });

      const cardName = this.add.text(x, 230, card.name, {
        fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
        wordWrap: { width: 140 },
      }).setOrigin(0.5).setScrollFactor(0).setDepth(72);

      const cardDesc = this.add.text(x, 280, card.description, {
        fontSize: '9px', color: '#cccccc', fontFamily: 'monospace',
        wordWrap: { width: 130 },
      }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(72);

      const cardCost = this.add.text(x - 60, 210, `${card.cost}`, {
        fontSize: '14px', color: '#fbbf24', fontFamily: 'monospace',
      }).setOrigin(0.5).setScrollFactor(0).setDepth(72);

      choiceElements.push(cardBg, cardName, cardDesc, cardCost);

      cardBg.on('pointerdown', () => {
        wsClient.send({ type: 'selectCard', cardId });
        cleanup();
      });
    });
  }

  private cleanupAndStop() {
    this.cardHand.destroy();
    this.combatUI.destroy();
    this.scene.stop('Combat');
  }
}
