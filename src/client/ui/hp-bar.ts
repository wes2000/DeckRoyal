export class HPBar {
  private scene: Phaser.Scene;
  private x: number;
  private y: number;
  private width: number;
  private height: number;
  private bg: Phaser.GameObjects.Rectangle;
  private bar: Phaser.GameObjects.Rectangle;
  private text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, depth = 50) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;

    this.bg = scene.add.rectangle(x, y, width, height, 0x333333)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(depth);
    this.bar = scene.add.rectangle(x, y, width, height, 0x4ade80)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(depth + 1);
    this.text = scene.add.text(x + width / 2, y + height / 2, '', {
      fontSize: '10px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setScrollFactor(0).setDepth(depth + 2);
  }

  update(current: number, max: number): void {
    const ratio = Math.max(0, current / max);
    this.bar.width = this.width * ratio;

    // Color based on HP percentage
    if (ratio > 0.5) this.bar.setFillStyle(0x4ade80);       // green
    else if (ratio > 0.25) this.bar.setFillStyle(0xfbbf24);  // yellow
    else this.bar.setFillStyle(0xef4444);                     // red

    this.text.setText(`${current}/${max}`);
  }

  setPosition(x: number, y: number): void {
    this.bg.setPosition(x, y);
    this.bar.setPosition(x, y);
    this.text.setPosition(x + this.width / 2, y + this.height / 2);
  }

  destroy(): void {
    this.bg.destroy();
    this.bar.destroy();
    this.text.destroy();
  }
}
