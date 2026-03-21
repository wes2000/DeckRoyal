export class VictoryScene extends Phaser.Scene {
  constructor() { super('Victory'); }

  create(data: { winnerId: string; winnerName: string; stats: any; isWinner: boolean }) {
    const { winnerName, stats, isWinner } = data;

    this.add.rectangle(400, 300, 800, 600, 0x000000, 0.85);

    const title = isWinner ? 'VICTORY!' : `${winnerName} WINS!`;
    const color = isWinner ? '#e8a838' : '#aaaaaa';
    this.add.text(400, 80, title, {
      fontSize: '48px', color, fontFamily: 'monospace',
    }).setOrigin(0.5);

    if (isWinner) {
      // Animate title
      const titleObj = this.children.getAt(this.children.length - 1) as Phaser.GameObjects.Text;
      this.tweens.add({
        targets: titleObj, scale: 1.1, duration: 800, yoyo: true, repeat: -1,
      });
    }

    const statLines = [
      `Damage Dealt: ${stats?.damageDealt ?? 0}`,
      `Cards Played: ${stats?.cardsPlayed ?? 0}`,
      `Monsters Killed: ${stats?.monstersKilled ?? 0}`,
      `Events Claimed: ${stats?.eventsClaimed ?? 0}`,
    ];
    statLines.forEach((line, i) => {
      this.add.text(400, 200 + i * 40, line, {
        fontSize: '18px', color: '#cccccc', fontFamily: 'monospace',
      }).setOrigin(0.5);
    });

    // Return to lobby button
    const btnBg = this.add.rectangle(400, 480, 250, 50, 0xe8a838)
      .setInteractive({ useHandCursor: true });
    this.add.text(400, 480, 'RETURN TO LOBBY', {
      fontSize: '16px', color: '#000000', fontFamily: 'monospace',
    }).setOrigin(0.5);

    btnBg.on('pointerdown', () => {
      this.scene.stop('Overworld');
      this.scene.stop('Combat');
      this.scene.start('Lobby');
    });
    btnBg.on('pointerover', () => btnBg.setFillStyle(0xfcd34d));
    btnBg.on('pointerout', () => btnBg.setFillStyle(0xe8a838));
  }
}
