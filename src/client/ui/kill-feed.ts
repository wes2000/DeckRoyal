export class KillFeed {
  private scene: Phaser.Scene;
  private entries: Phaser.GameObjects.Text[] = [];
  private maxEntries = 5;
  private x: number;
  private y: number;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.scene = scene;
    this.x = x;
    this.y = y;
  }

  addEntry(text: string, color = '#ffffff') {
    const entry = this.scene.add.text(this.x, this.y, text, {
      fontSize: '11px', color, fontFamily: 'monospace',
      backgroundColor: '#00000088', padding: { x: 4, y: 2 },
    }).setOrigin(1, 0).setScrollFactor(0).setDepth(45);

    this.entries.unshift(entry);
    this.repositionEntries();

    if (this.entries.length > this.maxEntries) {
      const old = this.entries.pop();
      old?.destroy();
    }

    this.scene.tweens.add({
      targets: entry, alpha: 0, delay: 8000, duration: 1000,
      onComplete: () => {
        const idx = this.entries.indexOf(entry);
        if (idx >= 0) this.entries.splice(idx, 1);
        entry.destroy();
        this.repositionEntries();
      },
    });
  }

  private repositionEntries() {
    this.entries.forEach((e, i) => e.setY(this.y + i * 18));
  }

  destroy() {
    this.entries.forEach(e => e.destroy());
    this.entries = [];
  }
}
