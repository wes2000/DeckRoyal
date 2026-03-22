import { HPBar } from './hp-bar';

export class CombatUI {
  private scene: Phaser.Scene;
  private enemyHpBar: HPBar;
  private playerHpBar: HPBar;
  private energyOrb: Phaser.GameObjects.Arc;
  private energyText: Phaser.GameObjects.Text;
  private blockIcon: Phaser.GameObjects.Container;
  private drawPileText: Phaser.GameObjects.Text;
  private discardPileText: Phaser.GameObjects.Text;
  private intentContainer: Phaser.GameObjects.Container;
  private intentText: Phaser.GameObjects.Text;
  private intentIcon: Phaser.GameObjects.Text;
  private enemyNameText: Phaser.GameObjects.Text;
  private enemyBlockIcon: Phaser.GameObjects.Container;
  private endTurnBtn: Phaser.GameObjects.Container;
  private fleeBtn: Phaser.GameObjects.Text | null = null;
  private turnTimerBg: Phaser.GameObjects.Rectangle;
  private turnTimerBar: Phaser.GameObjects.Rectangle;
  private roundText: Phaser.GameObjects.Text;
  private combatBg: Phaser.GameObjects.Rectangle;
  private playerSprite: Phaser.GameObjects.Container;
  private enemySprite: Phaser.GameObjects.Container;
  private drawPileBg: Phaser.GameObjects.Arc;
  private discardPileBg: Phaser.GameObjects.Arc;
  private onEndTurn: () => void;
  private onFlee: () => void;
  private prevMonsterHp = -1;
  private prevPlayerHp = -1;

  constructor(scene: Phaser.Scene, onEndTurn: () => void, onFlee: () => void) {
    this.scene = scene;
    this.onEndTurn = onEndTurn;
    this.onFlee = onFlee;

    const D = 56; // base depth

    // ── Background ──────────────────────────────────────────────────────────
    this.combatBg = scene.add.rectangle(400, 300, 800, 600, 0x1a1a2e, 0.95)
      .setScrollFactor(0).setDepth(55);

    // Floor line
    scene.add.rectangle(400, 380, 800, 2, 0x333355)
      .setScrollFactor(0).setDepth(D);

    // ── Player sprite (left side) ───────────────────────────────────────────
    this.playerSprite = scene.add.container(180, 310).setScrollFactor(0).setDepth(D);
    // Simple character representation
    const playerBody = scene.add.rectangle(0, 0, 50, 70, 0x4488cc)
      .setStrokeStyle(2, 0x6699dd);
    const playerHead = scene.add.circle(0, -45, 15, 0x4488cc)
      .setStrokeStyle(2, 0x6699dd);
    const playerLabel = scene.add.text(0, 45, 'YOU', {
      fontSize: '10px', color: '#88bbff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.playerSprite.add([playerBody, playerHead, playerLabel]);

    // Player HP bar (under player sprite)
    this.playerHpBar = new HPBar(scene, 115, 370, 130, 18, D + 1);

    // Player block icon
    this.blockIcon = this.createBlockIcon(240, 300, D + 2);

    // ── Enemy sprite (right side) ───────────────────────────────────────────
    this.enemySprite = scene.add.container(580, 280).setScrollFactor(0).setDepth(D);
    // Larger enemy body
    const enemyBody = scene.add.rectangle(0, 10, 80, 90, 0xcc4444)
      .setStrokeStyle(2, 0xdd6666);
    const enemyHead = scene.add.circle(0, -45, 20, 0xcc4444)
      .setStrokeStyle(2, 0xdd6666);
    // Eyes
    const eye1 = scene.add.circle(-8, -50, 4, 0xffffff);
    const eye2 = scene.add.circle(8, -50, 4, 0xffffff);
    const pupil1 = scene.add.circle(-8, -50, 2, 0x000000);
    const pupil2 = scene.add.circle(8, -50, 2, 0x000000);
    this.enemySprite.add([enemyBody, enemyHead, eye1, eye2, pupil1, pupil2]);

    // Enemy name (under enemy)
    this.enemyNameText = scene.add.text(580, 360, '', {
      fontSize: '14px', color: '#ff6666', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D);

    // Enemy HP bar (under name)
    this.enemyHpBar = new HPBar(scene, 500, 378, 160, 16, D + 1);

    // Enemy block icon
    this.enemyBlockIcon = this.createBlockIcon(670, 280, D + 2);

    // ── Intent (above enemy) ────────────────────────────────────────────────
    this.intentContainer = scene.add.container(580, 200).setScrollFactor(0).setDepth(D + 1);
    const intentBg = scene.add.rectangle(0, 0, 140, 30, 0x000000, 0.6)
      .setStrokeStyle(1, 0x555555);
    this.intentIcon = scene.add.text(-55, 0, '', {
      fontSize: '16px', color: '#ff6666', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.intentText = scene.add.text(5, 0, '', {
      fontSize: '11px', color: '#fbbf24', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.intentContainer.add([intentBg, this.intentIcon, this.intentText]);

    // ── Energy orb (bottom-left, left of cards) ─────────────────────────────
    this.energyOrb = scene.add.circle(65, 480, 28, 0x882222)
      .setStrokeStyle(3, 0xcc4444).setScrollFactor(0).setDepth(D + 3);
    this.energyText = scene.add.text(65, 480, '', {
      fontSize: '22px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 4);

    // ── End Turn button (right side) ────────────────────────────────────────
    this.endTurnBtn = scene.add.container(730, 460).setScrollFactor(0).setDepth(D + 3);
    const btnBg = scene.add.rectangle(0, 0, 100, 36, 0x225522)
      .setStrokeStyle(2, 0x44aa44);
    const btnText = scene.add.text(0, 0, 'END TURN', {
      fontSize: '12px', color: '#4ade80', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    this.endTurnBtn.add([btnBg, btnText]);
    btnBg.setInteractive({ useHandCursor: true });
    btnBg.on('pointerdown', () => this.onEndTurn());
    btnBg.on('pointerover', () => { btnBg.setFillStyle(0x337733); btnText.setColor('#86efac'); });
    btnBg.on('pointerout', () => { btnBg.setFillStyle(0x225522); btnText.setColor('#4ade80'); });

    // ── Draw pile (bottom-left corner) ──────────────────────────────────────
    this.drawPileBg = scene.add.circle(30, 560, 22, 0x333355)
      .setStrokeStyle(2, 0x5555aa).setScrollFactor(0).setDepth(D + 2);
    this.drawPileText = scene.add.text(30, 560, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3);

    // ── Discard pile (bottom-right corner) ──────────────────────────────────
    this.discardPileBg = scene.add.circle(770, 560, 22, 0x553333)
      .setStrokeStyle(2, 0xaa5555).setScrollFactor(0).setDepth(D + 2);
    this.discardPileText = scene.add.text(770, 560, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 3);

    // ── Turn timer bar (top) ────────────────────────────────────────────────
    this.turnTimerBg = scene.add.rectangle(0, 0, 800, 4, 0x222244)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(D + 1);
    this.turnTimerBar = scene.add.rectangle(0, 0, 800, 4, 0xe8a838)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(D + 2);

    // ── Round/turn text (top center) ────────────────────────────────────────
    this.roundText = scene.add.text(400, 14, '', {
      fontSize: '11px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(D + 1);
  }

  private createBlockIcon(x: number, y: number, depth: number): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y).setScrollFactor(0).setDepth(depth);
    const bg = this.scene.add.circle(0, 0, 16, 0x2255aa).setStrokeStyle(2, 0x60a5fa);
    const text = this.scene.add.text(0, 0, '', {
      fontSize: '12px', color: '#ffffff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5);
    container.add([bg, text]);
    container.setVisible(false);
    return container;
  }

  private updateBlockIcon(container: Phaser.GameObjects.Container, block: number): void {
    if (block > 0) {
      container.setVisible(true);
      (container.list[1] as Phaser.GameObjects.Text).setText(`${block}`);
    } else {
      container.setVisible(false);
    }
  }

  update(combatState: any, playerState: any): void {
    if (!playerState) return;

    // Player HP
    this.playerHpBar.update(playerState.hp, playerState.maxHp);
    this.updateBlockIcon(this.blockIcon, playerState.block ?? 0);

    // Damage popups
    if (this.prevPlayerHp > 0 && playerState.hp < this.prevPlayerHp) {
      const dmg = this.prevPlayerHp - playerState.hp;
      this.showDamageNumber(180, 270, Math.round(dmg));
    }
    this.prevPlayerHp = playerState.hp;

    // Draw/discard
    this.drawPileText.setText(`${playerState.drawPile?.length ?? 0}`);
    this.discardPileText.setText(`${playerState.discardPile?.length ?? 0}`);

    if (!combatState) return;

    // Round info
    if (combatState.type === 'pvp' && combatState.maxRounds > 0) {
      this.roundText.setText(`Round ${combatState.round}/${combatState.maxRounds}`);
    } else {
      this.roundText.setText(`Turn ${combatState.turnCounters?.[playerState.id] ?? 0}`);
    }

    // Turn timer
    const remaining = (combatState.turnTimer - Date.now()) / 1000;
    const timerRatio = Math.max(0, remaining / 30);
    this.turnTimerBar.width = 800 * timerRatio;

    // Enemy info (PvE)
    if (combatState.type === 'pve' && combatState.monster) {
      const monster = combatState.monster;
      this.enemyNameText.setText(monster.name);
      this.enemyHpBar.update(monster.hp, monster.maxHp);
      this.updateBlockIcon(this.enemyBlockIcon, monster.block ?? 0);

      // Damage popup for monster
      if (this.prevMonsterHp > 0 && monster.hp < this.prevMonsterHp) {
        const dmg = this.prevMonsterHp - monster.hp;
        this.showDamageNumber(580, 230, Math.round(dmg));
      }
      this.prevMonsterHp = monster.hp;

      // Intent
      if (monster.intent) {
        this.intentContainer.setVisible(true);
        const icons: Record<string, string> = { attack: '\u2694', defend: '\u26E8', buff: '\u2B06' };
        this.intentIcon.setText(icons[monster.intent.type] ?? '?');
        const labels: Record<string, string> = {
          attack: `${monster.intent.value}`,
          defend: `${monster.intent.value}`,
          buff: `+${monster.intent.value}`,
        };
        this.intentText.setText(labels[monster.intent.type] ?? '');
      } else {
        this.intentContainer.setVisible(false);
      }
    } else if (combatState.type === 'pvp') {
      this.enemyNameText.setText('PvP Combat');
      this.intentContainer.setVisible(false);
      this.updateBlockIcon(this.enemyBlockIcon, 0);
    }

    // Energy
    const energy = combatState.energy ?? 0;
    this.energyText.setText(`${energy}`);

    // Flee button (PvE, after turn 1)
    if (combatState.type === 'pve' && (combatState.turnCounters?.[playerState.id] ?? 0) > 1) {
      if (!this.fleeBtn) {
        this.fleeBtn = this.scene.add.text(730, 500, '[ FLEE ]', {
          fontSize: '11px', color: '#ef4444', fontFamily: 'monospace',
        }).setOrigin(0.5).setScrollFactor(0).setDepth(58).setInteractive({ useHandCursor: true });
        this.fleeBtn.on('pointerdown', () => this.onFlee());
      }
    }
  }

  private showDamageNumber(x: number, y: number, damage: number): void {
    const dmgText = this.scene.add.text(x, y, `${damage}`, {
      fontSize: '28px', color: '#ff4444', fontFamily: 'monospace', fontStyle: 'bold',
      stroke: '#000000', strokeThickness: 3,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(65);

    this.scene.tweens.add({
      targets: dmgText,
      y: y - 60,
      alpha: 0,
      scale: 1.5,
      duration: 800,
      ease: 'Power2',
      onComplete: () => dmgText.destroy(),
    });
  }

  destroy(): void {
    this.combatBg.destroy();
    this.enemyHpBar.destroy();
    this.playerHpBar.destroy();
    this.energyOrb.destroy();
    this.energyText.destroy();
    this.blockIcon.destroy();
    this.drawPileText.destroy();
    this.discardPileText.destroy();
    this.drawPileBg.destroy();
    this.discardPileBg.destroy();
    this.intentContainer.destroy();
    this.enemyNameText.destroy();
    this.enemyBlockIcon.destroy();
    this.endTurnBtn.destroy();
    this.fleeBtn?.destroy();
    this.turnTimerBg.destroy();
    this.turnTimerBar.destroy();
    this.roundText.destroy();
    this.playerSprite.destroy();
    this.enemySprite.destroy();
  }
}
