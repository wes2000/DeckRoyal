import Phaser from 'phaser';
import { BootScene } from './scenes/boot';
import { LobbyScene } from './scenes/lobby';
import { OverworldScene } from './scenes/overworld';
import { CombatScene } from './scenes/combat';
import { VictoryScene } from './scenes/victory';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: 'game-container',
  width: 800,
  height: 600,
  pixelArt: true,
  roundPixels: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, LobbyScene, OverworldScene, CombatScene, VictoryScene],
  backgroundColor: '#111111',
};

new Phaser.Game(config);
