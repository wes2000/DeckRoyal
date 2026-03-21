import { HPBar } from './hp-bar';

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
  }

  update(gameState: any, myPlayerId: string): void {
    const player = gameState.players[myPlayerId];
    if (!player) return;

    this.nameText.setText(player.name);
    this.classText.setText(player.class?.toUpperCase() ?? '');
    this.hpBar.update(player.hp, player.maxHp);
    this.blockText.setText(player.block > 0 ? `Block: ${player.block}` : '');

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

  destroy(): void {
    this.hpBar.destroy();
    this.nameText.destroy();
    this.classText.destroy();
    this.blockText.destroy();
    this.aliveText.destroy();
    this.timerText.destroy();
    this.zoneText.destroy();
    this.eventLockText.destroy();
  }
}
