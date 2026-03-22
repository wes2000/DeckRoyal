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
  private currentEnergy = 0;
  private pendingReward = false;
  private victoryElements: Phaser.GameObjects.GameObject[] = [];

  constructor() { super('Combat'); }

  create(data: any) {
    // Initial combat data passed from overworld
    if (data?.combatData) {
      this.latestCombatState = data.combatData;
      this.currentEnergy = data.combatData.energy ?? 0;
    }

    this.cardHand = new CardHand(this, (cardId) => {
      wsClient.send({ type: 'playCard', cardId });
    });

    this.combatUI = new CombatUI(
      this,
      () => wsClient.send({ type: 'endTurn' }),
      () => wsClient.send({ type: 'flee' }),
    );

    // Listen for combat updates (store refs for cleanup)
    const onCombatState = (msg: any) => this.handleCombatState(msg.data);
    const onGameState = (msg: any) => this.handleGameState(msg.data);
    const onCardChoice = (msg: any) => this.showCardChoice(msg.data);

    wsClient.on('combatState', onCombatState);
    wsClient.on('gameState', onGameState);
    wsClient.on('cardChoice', onCardChoice);

    this.events.on('shutdown', () => {
      wsClient.off('combatState', onCombatState);
      wsClient.off('gameState', onGameState);
      wsClient.off('cardChoice', onCardChoice);
    });

    // Render initial state if we have it
    if (this.latestCombatState) {
      this.combatUI.update(this.latestCombatState, this.latestPlayerState);
    }
  }

  private handleCombatState(data: any) {
    this.latestCombatState = data;
    this.currentEnergy = data.energy ?? this.currentEnergy;

    if (data.isComplete) {
      // PvE victory: wait for reward cardChoice before closing
      if (data.type === 'pve' && data.monster && data.monster.hp <= 0) {
        this.pendingReward = true;
        this.cardHand.destroy();
        this.showVictoryBanner();
        // Safety timeout: if no reward arrives in 3s, close anyway
        this.time.delayedCall(3000, () => {
          if (this.pendingReward) this.cleanupAndStop();
        });
        return;
      }
      this.cleanupAndStop();
      return;
    }

    this.combatUI.update(data, this.latestPlayerState);

    // Re-render cards with updated energy
    if (this.latestPlayerState?.hand && Array.isArray(this.latestPlayerState.hand)) {
      this.cardHand.update(this.latestPlayerState.hand, this.currentEnergy);
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

    if (this.myPlayerId) {
      this.latestPlayerState = data.players[this.myPlayerId];

      if (this.latestPlayerState?.hand && Array.isArray(this.latestPlayerState.hand)) {
        this.cardHand.update(this.latestPlayerState.hand, this.currentEnergy);
      }

      this.combatUI.update(this.latestCombatState, this.latestPlayerState);
    }
  }

  private showVictoryBanner(): void {
    const banner = this.add.text(400, 250, 'VICTORY!', {
      fontSize: '32px', color: '#4ade80', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(70);
    this.victoryElements.push(banner);
  }

  private showCardChoice(data: any) {
    const cards = data.cards as string[];
    if (!cards || cards.length === 0) {
      if (this.pendingReward) this.cleanupAndStop();
      return;
    }

    // Clear victory banner
    this.victoryElements.forEach(el => el.destroy());
    this.victoryElements = [];

    const overlay = this.add.rectangle(400, 300, 800, 600, 0x000000, 0.8)
      .setScrollFactor(0).setDepth(70);

    const title = this.add.text(400, 100, 'Choose a Reward Card', {
      fontSize: '24px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71);

    const skipBtn = this.add.text(400, 500, '[ SKIP ]', {
      fontSize: '16px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(71).setInteractive({ useHandCursor: true });

    const choiceElements: Phaser.GameObjects.GameObject[] = [overlay, title, skipBtn];

    const cleanup = () => {
      choiceElements.forEach(el => el.destroy());
      if (this.pendingReward) this.cleanupAndStop();
    };

    skipBtn.on('pointerdown', () => cleanup());

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
    this.pendingReward = false;
    this.victoryElements.forEach(el => el.destroy());
    this.victoryElements = [];
    this.cardHand.destroy();
    this.combatUI.destroy();
    this.scene.stop('Combat');
  }
}
