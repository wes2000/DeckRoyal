import { HPBar } from './hp-bar';

export class CombatUI {
  private scene: Phaser.Scene;
  private enemyHpBar: HPBar;
  private playerHpBar: HPBar;
  private energyText: Phaser.GameObjects.Text;
  private blockText: Phaser.GameObjects.Text;
  private drawPileText: Phaser.GameObjects.Text;
  private discardPileText: Phaser.GameObjects.Text;
  private intentText: Phaser.GameObjects.Text;
  private enemyNameText: Phaser.GameObjects.Text;
  private enemyBlockText: Phaser.GameObjects.Text;
  private endTurnBtn: Phaser.GameObjects.Text;
  private fleeBtn: Phaser.GameObjects.Text | null = null;
  private turnTimerBg: Phaser.GameObjects.Rectangle;
  private turnTimerBar: Phaser.GameObjects.Rectangle;
  private roundText: Phaser.GameObjects.Text;
  private combatBg: Phaser.GameObjects.Rectangle;
  private onEndTurn: () => void;
  private onFlee: () => void;

  constructor(scene: Phaser.Scene, onEndTurn: () => void, onFlee: () => void) {
    this.scene = scene;
    this.onEndTurn = onEndTurn;
    this.onFlee = onFlee;

    // Semi-transparent combat background
    this.combatBg = scene.add.rectangle(400, 300, 800, 600, 0x000000, 0.7)
      .setScrollFactor(0).setDepth(55);

    // Enemy area (top center)
    this.enemyNameText = scene.add.text(400, 60, '', {
      fontSize: '16px', color: '#ef4444', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);

    this.enemyHpBar = new HPBar(scene, 300, 85, 200, 16, 58);

    this.enemyBlockText = scene.add.text(400, 108, '', {
      fontSize: '12px', color: '#60a5fa', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);

    this.intentText = scene.add.text(400, 128, '', {
      fontSize: '12px', color: '#fbbf24', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);

    // Player area (bottom-left)
    this.playerHpBar = new HPBar(scene, 10, 430, 150, 14, 58);

    this.blockText = scene.add.text(10, 450, '', {
      fontSize: '11px', color: '#60a5fa', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(56);

    // Energy (bottom-right)
    this.energyText = scene.add.text(740, 430, '', {
      fontSize: '20px', color: '#fbbf24', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);

    // End turn button
    this.endTurnBtn = scene.add.text(740, 460, '[ END TURN ]', {
      fontSize: '14px', color: '#4ade80', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56).setInteractive({ useHandCursor: true });
    this.endTurnBtn.on('pointerdown', () => this.onEndTurn());
    this.endTurnBtn.on('pointerover', () => this.endTurnBtn.setColor('#86efac'));
    this.endTurnBtn.on('pointerout', () => this.endTurnBtn.setColor('#4ade80'));

    // Draw/discard pile
    this.drawPileText = scene.add.text(10, 470, '', {
      fontSize: '10px', color: '#888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(56);

    this.discardPileText = scene.add.text(10, 485, '', {
      fontSize: '10px', color: '#888', fontFamily: 'monospace',
    }).setScrollFactor(0).setDepth(56);

    // Turn timer bar
    this.turnTimerBg = scene.add.rectangle(0, 0, 800, 4, 0x333333)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(56);
    this.turnTimerBar = scene.add.rectangle(0, 0, 800, 4, 0xe8a838)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(57);

    // Round text
    this.roundText = scene.add.text(400, 20, '', {
      fontSize: '12px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(56);
  }

  update(combatState: any, playerState: any): void {
    if (!playerState) return;

    // Player HP
    this.playerHpBar.update(playerState.hp, playerState.maxHp);
    this.blockText.setText(playerState.block > 0 ? `Block: ${playerState.block}` : '');

    // Draw/discard
    this.drawPileText.setText(`Draw: ${playerState.drawPile?.length ?? 0}`);
    this.discardPileText.setText(`Discard: ${playerState.discardPile?.length ?? 0}`);

    if (!combatState) return;

    // Round info
    if (combatState.type === 'pvp' && combatState.maxRounds > 0) {
      this.roundText.setText(`Round ${combatState.round}/${combatState.maxRounds}`);
    } else {
      this.roundText.setText(`Turn ${combatState.turnCounters?.[playerState.id] ?? 0}`);
    }

    // Turn timer
    const timerRatio = combatState.turnTimer / 30;
    this.turnTimerBar.width = 800 * Math.max(0, timerRatio);

    // Enemy info (PvE)
    if (combatState.type === 'pve' && combatState.monster) {
      const monster = combatState.monster;
      this.enemyNameText.setText(monster.name);
      this.enemyHpBar.update(monster.hp, monster.maxHp);
      this.enemyBlockText.setText(monster.block > 0 ? `Block: ${monster.block}` : '');
      // Show monster intent
      if (monster.intent) {
        const intentLabels: Record<string, string> = {
          attack: `Attacks for ${monster.intent.value}`,
          defend: `Defends for ${monster.intent.value}`,
          buff: `Buffs ${monster.intent.buff ?? 'self'} +${monster.intent.value}`,
        };
        this.intentText.setText(intentLabels[monster.intent.type] ?? '');
      } else {
        this.intentText.setText('');
      }
    } else if (combatState.type === 'pvp') {
      this.enemyNameText.setText('PvP Combat');
      this.intentText.setText('');
      this.enemyBlockText.setText('');
    }

    // Energy from combatState (augmented by server)
    this.energyText.setText(`Energy: ${combatState.energy ?? '?'}`);

    // Flee button (PvE, after turn 1)
    if (combatState.type === 'pve' && (combatState.turnCounters?.[playerState.id] ?? 0) > 1) {
      if (!this.fleeBtn) {
        this.fleeBtn = this.scene.add.text(740, 490, '[ FLEE ]', {
          fontSize: '12px', color: '#ef4444', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(56).setInteractive({ useHandCursor: true });
        this.fleeBtn.on('pointerdown', () => this.onFlee());
      }
    }
  }

  destroy(): void {
    this.combatBg.destroy();
    this.enemyHpBar.destroy();
    this.playerHpBar.destroy();
    this.energyText.destroy();
    this.blockText.destroy();
    this.drawPileText.destroy();
    this.discardPileText.destroy();
    this.intentText.destroy();
    this.enemyNameText.destroy();
    this.enemyBlockText.destroy();
    this.endTurnBtn.destroy();
    this.fleeBtn?.destroy();
    this.turnTimerBg.destroy();
    this.turnTimerBar.destroy();
    this.roundText.destroy();
  }
}
