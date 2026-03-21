export class LobbyScene extends Phaser.Scene {
  constructor() { super('Lobby'); }
  create() {
    this.add.text(400, 300, 'DECKBRAWL', { fontSize: '32px', color: '#e8a838' }).setOrigin(0.5);
  }
}
