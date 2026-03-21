const MINIMAP_SIZE = 120;
const MINIMAP_PADDING = 10;

export class Minimap {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private bg: Phaser.GameObjects.Rectangle;
  private border: Phaser.GameObjects.Rectangle;
  private playerDots: Map<string, Phaser.GameObjects.Arc> = new Map();
  private eventDots: Map<string, Phaser.GameObjects.Arc> = new Map();
  private zoneBorder: Phaser.GameObjects.Graphics;
  private mapWidth = 60;
  private mapHeight = 60;
  private myPlayerId: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    const x = 800 - MINIMAP_SIZE - MINIMAP_PADDING;
    const y = 600 - MINIMAP_SIZE - MINIMAP_PADDING;

    this.container = scene.add.container(x, y).setScrollFactor(0).setDepth(50);

    // Background
    this.bg = scene.add.rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE, 0x111111, 0.8).setOrigin(0, 0);
    this.container.add(this.bg);

    // Border
    this.border = scene.add.rectangle(0, 0, MINIMAP_SIZE, MINIMAP_SIZE).setOrigin(0, 0).setStrokeStyle(1, 0x555555);
    this.container.add(this.border);

    // Zone boundary graphics
    this.zoneBorder = scene.add.graphics();
    this.container.add(this.zoneBorder);
  }

  setMyPlayerId(id: string) {
    this.myPlayerId = id;
  }

  update(gameState: any): void {
    if (gameState.map) {
      this.mapWidth = gameState.map.width;
      this.mapHeight = gameState.map.height;
    }

    this.updatePlayerDots(gameState.players);
    this.updateEventDots(gameState.events);
    this.updateZoneBorder(gameState.zoneBoundary);
  }

  private mapToMinimap(mapX: number, mapY: number): { x: number; y: number } {
    return {
      x: (mapX / this.mapWidth) * MINIMAP_SIZE,
      y: (mapY / this.mapHeight) * MINIMAP_SIZE,
    };
  }

  private updatePlayerDots(players: Record<string, any>) {
    const activeIds = new Set<string>();

    for (const [id, player] of Object.entries(players)) {
      if (!(player as any).isAlive) continue;
      activeIds.add(id);

      const pos = this.mapToMinimap((player as any).position.x, (player as any).position.y);
      let dot = this.playerDots.get(id);

      if (!dot) {
        const color = id === this.myPlayerId ? 0x4ade80 : 0xef4444;
        dot = this.scene.add.circle(pos.x, pos.y, 2, color);
        this.container.add(dot);
        this.playerDots.set(id, dot);
      }

      dot.setPosition(pos.x, pos.y);
    }

    // Remove dead/gone players
    for (const [id, dot] of this.playerDots) {
      if (!activeIds.has(id)) {
        dot.destroy();
        this.playerDots.delete(id);
      }
    }
  }

  private updateEventDots(events: any[]) {
    const activeIds = new Set<string>();

    for (const evt of events) {
      if (!evt.active) continue;
      activeIds.add(evt.id);

      if (!this.eventDots.has(evt.id)) {
        const pos = this.mapToMinimap(evt.position.x, evt.position.y);
        const colorMap: Record<string, number> = {
          campfire: 0xe8a838,
          blacksmith: 0x888888,
          small_monster: 0x50a050,
          rare_monster: 0xc03030,
          random: 0x8b5cf6,
        };
        const color = colorMap[evt.type] ?? 0xffffff;
        const dot = this.scene.add.circle(pos.x, pos.y, 1.5, color);
        this.container.add(dot);
        this.eventDots.set(evt.id, dot);
      }
    }

    for (const [id, dot] of this.eventDots) {
      if (!activeIds.has(id)) {
        dot.destroy();
        this.eventDots.delete(id);
      }
    }
  }

  private updateZoneBorder(zoneBoundary: any) {
    if (!zoneBoundary) return;
    this.zoneBorder.clear();
    this.zoneBorder.lineStyle(1, 0xef4444, 0.8);

    const topLeft = this.mapToMinimap(zoneBoundary.minX, zoneBoundary.minY);
    const bottomRight = this.mapToMinimap(zoneBoundary.maxX, zoneBoundary.maxY);
    const w = bottomRight.x - topLeft.x;
    const h = bottomRight.y - topLeft.y;

    this.zoneBorder.strokeRect(topLeft.x, topLeft.y, w, h);
  }

  destroy(): void {
    this.container.destroy();
  }
}
