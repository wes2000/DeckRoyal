export class Effects {
  static damageFlash(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
    sprite.setTintFill(0xff0000);
    scene.time.delayedCall(100, () => sprite.clearTint());
  }

  static healSparkle(scene: Phaser.Scene, x: number, y: number) {
    // Create green floating particles
    for (let i = 0; i < 5; i++) {
      const px = x + (Math.random() - 0.5) * 20;
      const py = y;
      const particle = scene.add.rectangle(px, py, 3, 3, 0x4ade80).setDepth(15);
      scene.tweens.add({
        targets: particle,
        y: py - 30 - Math.random() * 20,
        alpha: 0,
        duration: 600 + Math.random() * 400,
        onComplete: () => particle.destroy(),
      });
    }
  }

  static blockFlash(scene: Phaser.Scene, sprite: Phaser.GameObjects.Sprite) {
    sprite.setTintFill(0x5dadec);
    scene.time.delayedCall(150, () => sprite.clearTint());
  }

  static eliminationEffect(scene: Phaser.Scene, x: number, y: number) {
    // Red X that fades out
    const skull = scene.add.text(x, y, 'X', {
      fontSize: '24px', color: '#ff0000', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(20);

    scene.tweens.add({
      targets: skull,
      y: y - 30,
      alpha: 0,
      scale: 2,
      duration: 1500,
      onComplete: () => skull.destroy(),
    });
  }

  static damageNumber(scene: Phaser.Scene, x: number, y: number, amount: number, color = '#ef4444') {
    const text = scene.add.text(x, y, `-${amount}`, {
      fontSize: '14px', color, fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    scene.tweens.add({
      targets: text,
      y: y - 25,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy(),
    });
  }

  static healNumber(scene: Phaser.Scene, x: number, y: number, amount: number) {
    const text = scene.add.text(x, y, `+${amount}`, {
      fontSize: '14px', color: '#4ade80', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(20);

    scene.tweens.add({
      targets: text,
      y: y - 25,
      alpha: 0,
      duration: 1000,
      onComplete: () => text.destroy(),
    });
  }
}
