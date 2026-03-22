export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    // Show loading progress
    const bar = this.add.rectangle(400, 310, 0, 20, 0xe8a838);
    this.load.on('progress', (value: number) => {
      bar.width = 300 * value;
    });

    // Load tileset
    this.load.image('tiles', 'assets/tileset.png');

    // Load player spritesheet
    this.load.spritesheet('player', 'assets/player.png', {
      frameWidth: 16, frameHeight: 16,
    });

    // Load event sprites
    this.load.spritesheet('events', 'assets/events.png', {
      frameWidth: 16, frameHeight: 16,
    });
  }

  create() {
    // Set pixel-art filtering on sprite textures (NEAREST neighbor)
    ['tiles', 'player', 'events'].forEach(key => {
      this.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });

    // Create player walk animations
    const directions = ['down', 'up', 'left', 'right'];
    directions.forEach((dir, i) => {
      this.anims.create({
        key: `walk-${dir}`,
        frames: this.anims.generateFrameNumbers('player', { start: i * 2, end: i * 2 + 1 }),
        frameRate: 6,
        repeat: -1,
      });
    });

    this.scene.start('Lobby');
  }
}
