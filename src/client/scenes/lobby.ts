import { wsClient } from '../network/ws-client';
import type { PlayerClass } from '@shared/types';

interface LobbyPlayerData {
  id: string;
  name: string;
  class: PlayerClass | null;
  isHost: boolean;
}

interface LobbyStateData {
  id: string;
  code: string;
  hostId: string;
  started: boolean;
  players: LobbyPlayerData[];
}

export class LobbyScene extends Phaser.Scene {
  private playerListTexts: Phaser.GameObjects.Text[] = [];
  private selectedClass: PlayerClass | null = null;
  private isHost = false;
  private lobbyCode: string | null = null;
  private myPlayerId: string | null = null;
  private uiElements: Phaser.GameObjects.GameObject[] = [];
  private domElements: HTMLElement[] = [];
  private lobbyUICreated = false;

  constructor() { super('Lobby'); }

  create() {
    // Title
    this.add.text(400, 40, 'DECKBRAWL', {
      fontSize: '32px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Check URL for lobby code
    const pathMatch = window.location.pathname.match(/\/game\/(\w+)/);

    if (pathMatch) {
      this.showJoinUI(pathMatch[1]);
    } else {
      this.showMainMenu();
    }

    // Listen for server messages
    wsClient.on('lobbyState', (msg) => {
      const data = msg.data as LobbyStateData;
      this.lobbyCode = data.code;
      // Determine our player ID from first lobbyState received
      if (!this.myPlayerId && data.players.length > 0) {
        // We're the most recently added player
        this.myPlayerId = data.players[data.players.length - 1].id;
      }
      this.isHost = data.hostId === this.myPlayerId;
      if (!this.lobbyUICreated) {
        this.clearUI();
        this.showLobbyUI();
        this.lobbyUICreated = true;
      }
      this.updatePlayerList(data);
    });

    wsClient.on('gameState', () => {
      this.scene.start('Overworld');
    });

    wsClient.on('error', (msg) => {
      const data = msg.data as { message: string };
      this.showToast(data.message);
    });

    // Clean up DOM elements on scene shutdown
    this.events.on('shutdown', () => this.clearDomElements());
  }

  private createDomInput(placeholder: string, maxLength: number, borderColor: string, extraStyles = ''): HTMLInputElement {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.maxLength = maxLength;
    input.style.cssText = `position:absolute;font-size:${Math.round(16 * rect.height / 600)}px;padding:8px;background:#222;color:#fff;border:2px solid ${borderColor};text-align:center;font-family:monospace;z-index:10;${extraStyles}`;
    document.body.appendChild(input);
    this.domElements.push(input);
    return input;
  }

  private positionDomElement(el: HTMLElement, gameX: number, gameY: number, width: number): void {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / 800;
    const scaleY = rect.height / 600;
    const pixelX = rect.left + gameX * scaleX;
    const pixelY = rect.top + gameY * scaleY;
    el.style.left = `${pixelX - (width * scaleX) / 2}px`;
    el.style.top = `${pixelY}px`;
    el.style.width = `${width * scaleX}px`;
  }

  private showMainMenu() {
    // Name input
    const nameLabel = this.add.text(400, 140, 'Your Name:', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(nameLabel);

    const nameInput = this.createDomInput('Enter name...', 16, '#e8a838');
    this.positionDomElement(nameInput, 400, 165, 200);

    // Create Game button
    const createBtn = this.add.text(400, 250, '[ CREATE GAME ]', {
      fontSize: '20px', color: '#4ade80', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    createBtn.on('pointerover', () => createBtn.setColor('#86efac'));
    createBtn.on('pointerout', () => createBtn.setColor('#4ade80'));
    createBtn.on('pointerdown', () => {
      const name = nameInput.value.trim() || 'Player';
      this.connectAndSend(name, 'new');
    });
    this.uiElements.push(createBtn);

    // Join Game section
    const joinLabel = this.add.text(400, 310, '— or join with code —', {
      fontSize: '14px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(joinLabel);

    const codeInput = this.createDomInput('LOBBY CODE', 6, '#60a5fa', 'text-transform:uppercase;');
    this.positionDomElement(codeInput, 400, 340, 150);

    const joinBtn = this.add.text(400, 410, '[ JOIN GAME ]', {
      fontSize: '20px', color: '#60a5fa', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    joinBtn.on('pointerover', () => joinBtn.setColor('#93c5fd'));
    joinBtn.on('pointerout', () => joinBtn.setColor('#60a5fa'));
    joinBtn.on('pointerdown', () => {
      const name = nameInput.value.trim() || 'Player';
      const code = codeInput.value.trim().toUpperCase();
      if (!code) { this.showToast('Enter a lobby code'); return; }
      this.connectAndSend(name, code);
    });
    this.uiElements.push(joinBtn);

    // Reposition on resize
    this.scale.on('resize', () => {
      this.positionDomElement(nameInput, 400, 165, 200);
      this.positionDomElement(codeInput, 400, 340, 150);
    });
  }

  private showJoinUI(code: string) {
    const nameLabel = this.add.text(400, 200, 'Enter your name to join:', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(nameLabel);

    const nameInput = this.createDomInput('Your name...', 16, '#e8a838');
    this.positionDomElement(nameInput, 400, 230, 200);

    const joinBtn = this.add.text(400, 310, '[ JOIN ]', {
      fontSize: '20px', color: '#4ade80', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    joinBtn.on('pointerdown', () => {
      const name = nameInput.value.trim() || 'Player';
      this.connectAndSend(name, code.toUpperCase());
    });
    this.uiElements.push(joinBtn);

    this.scale.on('resize', () => {
      this.positionDomElement(nameInput, 400, 230, 200);
    });
  }

  private async connectAndSend(name: string, gameId: string) {
    try {
      await wsClient.connect();
      wsClient.send({ type: 'joinLobby', name, gameId });
    } catch {
      this.showToast('Failed to connect to server');
    }
  }

  private showLobbyUI() {
    // Lobby code display — click to copy
    const codeText = this.add.text(400, 100, `Code: ${this.lobbyCode}`, {
      fontSize: '24px', color: '#e8a838', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    codeText.on('pointerdown', () => {
      if (this.lobbyCode) {
        navigator.clipboard.writeText(this.lobbyCode).then(() => {
          shareText.setText('Copied!');
          this.time.delayedCall(1500, () => shareText.setText('Click code to copy'));
        });
      }
    });
    codeText.on('pointerover', () => codeText.setColor('#fcd34d'));
    codeText.on('pointerout', () => codeText.setColor('#e8a838'));
    this.uiElements.push(codeText);

    const shareText = this.add.text(400, 125, 'Click code to copy', {
      fontSize: '12px', color: '#888', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(shareText);

    // Class selection
    const classLabel = this.add.text(400, 170, 'Select Class:', {
      fontSize: '16px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(classLabel);

    const classes: { name: string; class: PlayerClass; color: string }[] = [
      { name: 'WARRIOR', class: 'warrior', color: '#ef4444' },
      { name: 'MAGE', class: 'mage', color: '#8b5cf6' },
      { name: 'ROGUE', class: 'rogue', color: '#22c55e' },
    ];

    classes.forEach((cls, i) => {
      const x = 250 + i * 150;
      const btn = this.add.text(x, 210, `[ ${cls.name} ]`, {
        fontSize: '16px', color: cls.color, fontFamily: 'monospace',
      }).setOrigin(0.5).setInteractive({ useHandCursor: true });

      btn.on('pointerdown', () => {
        this.selectedClass = cls.class;
        wsClient.send({ type: 'selectClass', class: cls.class });
      });
      this.uiElements.push(btn);
    });

    // Players header
    const playersHeader = this.add.text(400, 270, 'Players:', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5);
    this.uiElements.push(playersHeader);

    // Start button (host only)
    if (this.isHost) {
      this.addStartButton();
    }
  }

  private addStartButton() {
    const startBtn = this.add.text(400, 550, '[ START GAME ]', {
      fontSize: '22px', color: '#fbbf24', fontFamily: 'monospace',
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    startBtn.setName('startBtn');
    startBtn.on('pointerover', () => startBtn.setColor('#fcd34d'));
    startBtn.on('pointerout', () => startBtn.setColor('#fbbf24'));
    startBtn.on('pointerdown', () => {
      wsClient.send({ type: 'startGame' });
    });
    this.uiElements.push(startBtn);
  }

  private updatePlayerList(data: LobbyStateData) {
    // Clear old player texts
    this.playerListTexts.forEach(t => t.destroy());
    this.playerListTexts = [];

    data.players.forEach((player, i) => {
      const classStr = player.class ? ` (${player.class})` : ' (no class)';
      const hostStr = player.isHost ? ' \u2605' : '';
      const text = this.add.text(400, 300 + i * 30, `${player.name}${classStr}${hostStr}`, {
        fontSize: '14px',
        color: player.class ? '#4ade80' : '#888',
        fontFamily: 'monospace',
      }).setOrigin(0.5);
      this.playerListTexts.push(text);
    });

    // Show start button for host if not already present
    if (this.isHost) {
      const existing = this.children.getByName('startBtn');
      if (!existing) {
        this.addStartButton();
      }
    }
  }

  private showToast(message: string) {
    const toast = this.add.text(400, 560, message, {
      fontSize: '14px', color: '#ef4444', fontFamily: 'monospace',
      backgroundColor: '#1a1a1a', padding: { x: 10, y: 5 },
    }).setOrigin(0.5);
    this.time.delayedCall(3000, () => toast.destroy());
  }

  private clearUI() {
    this.uiElements.forEach(el => el.destroy());
    this.uiElements = [];
    this.clearDomElements();
  }

  private clearDomElements() {
    this.domElements.forEach(el => el.remove());
    this.domElements = [];
  }
}
