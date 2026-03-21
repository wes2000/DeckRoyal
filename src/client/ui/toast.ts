export class Toast {
  static show(scene: Phaser.Scene, message: string, color = '#ffffff', duration = 2000) {
    const text = scene.add.text(400, 200, message, {
      fontSize: '16px', color, fontFamily: 'monospace',
      backgroundColor: '#222222', padding: { x: 12, y: 6 },
    }).setOrigin(0.5).setScrollFactor(0).setDepth(200);

    scene.tweens.add({
      targets: text, y: 170, alpha: 0, duration: 500,
      delay: duration, onComplete: () => text.destroy(),
    });
  }
}
