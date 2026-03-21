# Plan 1: Core Game Logic

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete game engine — cards, combat, map generation, events, zones — as pure logic with full test coverage, no UI or networking.

**Architecture:** All game logic lives in `src/shared/` (types, constants, cards) and `src/engine/` (combat, map, events, zone). Everything is pure TypeScript functions operating on plain data — no classes with hidden state, no side effects, no DOM, no network. This makes every system independently testable and shareable between client and server later.

**Tech Stack:** TypeScript, Vitest (test runner), Node.js

**Spec:** `docs/superpowers/specs/2026-03-21-deckbrawl-design.md`

---

## File Structure

```
deckbrawl/
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── shared/
│   │   ├── types.ts              # All game types (Player, Card, GameState, etc.)
│   │   ├── constants.ts          # Game constants (HP, energy, zone timings, etc.)
│   │   └── cards/
│   │       ├── types.ts          # Card-specific types (CardDefinition, Effect, etc.)
│   │       ├── warrior.ts        # Warrior card definitions (16 basic + 24 archetype)
│   │       ├── mage.ts           # Mage card definitions (16 basic + 24 archetype)
│   │       ├── rogue.ts          # Rogue card definitions (16 basic + 24 archetype)
│   │       └── index.ts          # Card registry — lookup by id, class, archetype
│   └── engine/
│       ├── deck.ts               # Deck operations: create, draw, discard, shuffle
│       ├── combat.ts             # Combat flow: turns, energy, damage, block, card play
│       ├── card-effects.ts       # Card effect resolution: damage, block, buffs, debuffs
│       ├── monsters.ts           # Monster definitions, AI patterns, intent selection
│       ├── map-generator.ts      # Procedural map generation: terrain, paths, event placement
│       ├── zone.ts               # Zone shrinking: phases, damage, tile safety checks
│       ├── events.ts             # Event logic: campfire, blacksmith, random events
│       └── event-alternation.ts  # Event alternation rule tracking
└── tests/
    ├── shared/
    │   ├── types.test.ts
    │   ├── constants.test.ts
    │   └── cards/
    │       ├── warrior.test.ts
    │       ├── mage.test.ts
    │       ├── rogue.test.ts
    │       └── registry.test.ts
    └── engine/
        ├── deck.test.ts
        ├── combat.test.ts
        ├── card-effects.test.ts
        ├── monsters.test.ts
        ├── map-generator.test.ts
        ├── zone.test.ts
        ├── events.test.ts
        └── event-alternation.test.ts
```

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Initialize package.json**

```bash
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install typescript vitest @types/node --save-dev
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "sourceMap": true,
    "resolveJsonModule": true,
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@engine/*": ["./src/engine/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
  },
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, 'src/shared'),
      '@engine': path.resolve(__dirname, 'src/engine'),
    },
  },
});
```

- [ ] **Step 5: Add test script to package.json**

Add to `package.json` scripts:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 6: Verify setup with a smoke test**

Create `tests/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('project setup', () => {
  it('runs tests', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: 1 test passes.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vitest.config.ts tests/smoke.test.ts package-lock.json
git commit -m "feat: project scaffolding with TypeScript and Vitest"
```

---

### Task 2: Shared Types

**Files:**
- Create: `src/shared/types.ts`
- Create: `tests/shared/types.test.ts`

- [ ] **Step 1: Write type validation tests**

```typescript
import { describe, it, expect } from 'vitest';
import type { Player, GameState, Position, Tile, TileType, EventTile, EventType, PlayerClass, CombatState, CombatType } from '@shared/types';

describe('shared types', () => {
  it('creates a valid Player', () => {
    const player: Player = {
      id: 'p1',
      name: 'TestPlayer',
      class: 'warrior',
      hp: 100,
      maxHp: 100,
      position: { x: 0, y: 0 },
      deck: [],
      hand: [],
      drawPile: [],
      discardPile: [],
      block: 0,
      isAlive: true,
      freeNonFightEvents: 3,
      needsFight: false,
      pvpCooldowns: {},
      stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    };
    expect(player.hp).toBe(100);
    expect(player.class).toBe('warrior');
  });

  it('creates a valid GameState', () => {
    const state: GameState = {
      id: 'game1',
      phase: 'playing',
      players: {},
      map: { width: 60, height: 60, tiles: [] },
      events: [],
      elapsed: 0,
      zonePhase: 0,
      zoneBoundary: { minX: 0, minY: 0, maxX: 59, maxY: 59 },
      combats: {},
    };
    expect(state.phase).toBe('playing');
  });

  it('PlayerClass is warrior, mage, or rogue', () => {
    const classes: PlayerClass[] = ['warrior', 'mage', 'rogue'];
    expect(classes).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `@shared/types`

- [ ] **Step 3: Write the types**

Create `src/shared/types.ts`:
```typescript
export type PlayerClass = 'warrior' | 'mage' | 'rogue';
export type TileType = 'grass' | 'path' | 'rock' | 'water';
export type EventType = 'campfire' | 'blacksmith' | 'small_monster' | 'rare_monster' | 'random';
export type GamePhase = 'lobby' | 'countdown' | 'playing' | 'finished';
export type CombatType = 'pve' | 'pvp';
export type CardType = 'attack' | 'skill' | 'power';

export interface Position {
  x: number;
  y: number;
}

export interface PlayerStats {
  damageDealt: number;
  cardsPlayed: number;
  monstersKilled: number;
  eventsClaimed: number;
}

export interface Player {
  id: string;
  name: string;
  class: PlayerClass;
  hp: number;
  maxHp: number;
  position: Position;
  deck: string[];       // card IDs — the full deck
  hand: string[];       // card IDs currently in hand
  drawPile: string[];   // card IDs remaining to draw
  discardPile: string[]; // card IDs discarded
  block: number;
  isAlive: boolean;
  freeNonFightEvents: number;  // starts at 3, decrements
  needsFight: boolean;          // true if player must fight before next non-fight event
  pvpCooldowns: Record<string, number>; // playerId -> cooldown expiry timestamp
  stats: PlayerStats;
}

export interface Tile {
  type: TileType;
  walkable: boolean;
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Tile[][];  // tiles[y][x]
}

export interface EventTile {
  id: string;
  type: EventType;
  position: Position;
  active: boolean;  // false after consumed
}

export interface ZoneBoundary {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface MonsterState {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  block: number;
  patternIndex: number; // current position in attack pattern
  buffs: Record<string, number>;
}

export interface CombatState {
  id: string;
  type: CombatType;
  playerIds: string[];        // 1 for PvE, 2 for PvP
  activePlayerIndex: number;  // whose turn it is
  turnCounters: Record<string, number>; // playerId -> their turn number
  round: number;              // PvP round counter
  maxRounds: number;          // PvP: 4
  damageTracker: Record<string, number>; // playerId -> total damage taken this fight
  damageCap: number;          // PvP: 20, PvE: Infinity
  monster?: MonsterState;     // only for PvE
  turnTimer: number;          // seconds remaining in current turn
  isComplete: boolean;
}

export interface GameState {
  id: string;
  phase: GamePhase;
  players: Record<string, Player>;
  map: GameMap;
  events: EventTile[];
  elapsed: number;       // seconds since game start
  zonePhase: number;     // 0-5
  zoneBoundary: ZoneBoundary;
  combats: Record<string, CombatState>; // combatId -> state
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/types.ts tests/shared/types.test.ts
git commit -m "feat: define shared game types"
```

---

### Task 3: Game Constants

**Files:**
- Create: `src/shared/constants.ts`
- Create: `tests/shared/constants.test.ts`

- [ ] **Step 1: Write constants tests**

```typescript
import { describe, it, expect } from 'vitest';
import {
  STARTING_HP, MAX_HP_CAP, STARTING_ENERGY, ENERGY_PER_TURN,
  CARDS_PER_DRAW, TURN_TIMER_SECONDS, PVP_DAMAGE_CAP, PVP_MAX_ROUNDS,
  PVP_COOLDOWN_SECONDS, FLEE_HP_COST, MAP_WIDTH, MAP_HEIGHT,
  MOVEMENT_SPEED, FREE_NON_FIGHT_EVENTS, ZONE_PHASES,
  EVENT_DISTRIBUTION, getEventCountForPlayers
} from '@shared/constants';

describe('game constants', () => {
  it('has correct player defaults', () => {
    expect(STARTING_HP).toBe(100);
    expect(MAX_HP_CAP).toBe(120);
    expect(STARTING_ENERGY).toBe(2);
    expect(ENERGY_PER_TURN).toBe(1);
    expect(CARDS_PER_DRAW).toBe(5);
    expect(TURN_TIMER_SECONDS).toBe(30);
  });

  it('has correct PvP constants', () => {
    expect(PVP_DAMAGE_CAP).toBe(20);
    expect(PVP_MAX_ROUNDS).toBe(4);
    expect(PVP_COOLDOWN_SECONDS).toBe(10);
  });

  it('has correct map constants', () => {
    expect(MAP_WIDTH).toBe(60);
    expect(MAP_HEIGHT).toBe(60);
    expect(MOVEMENT_SPEED).toBe(5);
  });

  it('has 5 zone phases plus sudden death', () => {
    expect(ZONE_PHASES).toHaveLength(6);
    expect(ZONE_PHASES[0].startTime).toBe(0);
    expect(ZONE_PHASES[5].startTime).toBe(1080); // 18 minutes in seconds
  });

  it('calculates event count for player counts', () => {
    expect(getEventCountForPlayers(1)).toBe(8);
    expect(getEventCountForPlayers(4)).toBe(18);
    expect(getEventCountForPlayers(8)).toBe(30);
  });

  it('distributes events proportionally using largest-remainder', () => {
    const dist = EVENT_DISTRIBUTION;
    expect(dist.campfire + dist.blacksmith + dist.small_monster + dist.rare_monster + dist.random).toBe(30);
    expect(dist.campfire).toBe(6);
    expect(dist.small_monster).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Write constants**

Create `src/shared/constants.ts`:
```typescript
// Player
export const STARTING_HP = 100;
export const MAX_HP_CAP = 120;
export const STARTING_ENERGY = 2;
export const ENERGY_PER_TURN = 1;
export const CARDS_PER_DRAW = 5;
export const TURN_TIMER_SECONDS = 30;
export const FLEE_HP_COST = 10;
export const FREE_NON_FIGHT_EVENTS = 3;

// PvP
export const PVP_DAMAGE_CAP = 20;
export const PVP_MAX_ROUNDS = 4;
export const PVP_COOLDOWN_SECONDS = 10;

// Map
export const MAP_WIDTH = 60;
export const MAP_HEIGHT = 60;
export const MOVEMENT_SPEED = 5; // tiles per second

// Zone damage
export const ZONE_DAMAGE_PER_SECOND = 5;
export const SUDDEN_DEATH_DAMAGE_PER_SECOND = 2;

// Zone phases: { startTime (seconds), mapPercent }
export interface ZonePhase {
  startTime: number;
  mapPercent: number;
  isSuddenDeath: boolean;
}

export const ZONE_PHASES: ZonePhase[] = [
  { startTime: 0,    mapPercent: 100, isSuddenDeath: false },
  { startTime: 330,  mapPercent: 75,  isSuddenDeath: false },  // 5:30
  { startTime: 540,  mapPercent: 50,  isSuddenDeath: false },  // 9:00
  { startTime: 720,  mapPercent: 25,  isSuddenDeath: false },  // 12:00
  { startTime: 900,  mapPercent: 15,  isSuddenDeath: false },  // 15:00
  { startTime: 1080, mapPercent: 5,   isSuddenDeath: true },   // 18:00
];

export const ZONE_WARNING_TIME = 300; // 5:00 — warning starts at this time

// Event distribution for 8 players (base ratios)
export const EVENT_DISTRIBUTION = {
  campfire: 6,
  blacksmith: 4,
  small_monster: 10,
  rare_monster: 4,
  random: 6,
} as const;

const EVENT_TOTAL_BASE = 30;

export function getEventCountForPlayers(playerCount: number): number {
  return Math.round(playerCount * 3.75);
}

export function getEventDistributionForPlayers(playerCount: number): Record<string, number> {
  const total = getEventCountForPlayers(playerCount);
  const ratios = EVENT_DISTRIBUTION;
  const keys = Object.keys(ratios) as (keyof typeof ratios)[];

  // Largest-remainder method
  const raw = keys.map(k => ({ key: k, value: (ratios[k] / EVENT_TOTAL_BASE) * total }));
  const floored = raw.map(r => ({ ...r, floor: Math.floor(r.value), remainder: r.value - Math.floor(r.value) }));

  let currentTotal = floored.reduce((sum, r) => sum + r.floor, 0);
  const sorted = [...floored].sort((a, b) => b.remainder - a.remainder);

  for (const item of sorted) {
    if (currentTotal >= total) break;
    item.floor++;
    currentTotal++;
  }

  const result: Record<string, number> = {};
  for (const item of floored) {
    result[item.key] = item.floor;
  }
  return result;
}

// Monster stats
export const SMALL_MONSTER_HP = { min: 30, max: 45 };
export const SMALL_MONSTER_DAMAGE = { min: 5, max: 10 };
export const RARE_MONSTER_HP = { min: 60, max: 80 };
export const RARE_MONSTER_DAMAGE = { min: 10, max: 18 };

// Campfire
export const CAMPFIRE_HEAL = { min: 25, max: 30 };
```

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/constants.ts tests/shared/constants.test.ts
git commit -m "feat: add game constants and event scaling formula"
```

---

### Task 4: Card Type System

**Files:**
- Create: `src/shared/cards/types.ts`

- [ ] **Step 1: Define card types**

```typescript
import type { CardType, PlayerClass } from '../types';

export type EffectType =
  | 'damage'        // deal damage to target
  | 'block'         // gain block
  | 'buff'          // apply buff to self
  | 'debuff'        // apply debuff to target
  | 'draw'          // draw cards
  | 'heal'          // heal HP
  | 'energy'        // gain energy
  | 'poison'        // apply poison stacks
  | 'burn'          // apply burn stacks
  | 'aoe_damage';   // damage all enemies (relevant for future multi-enemy)

export type BuffType =
  | 'strength'      // +N damage per attack
  | 'vulnerable'    // take 50% more damage
  | 'weak'          // deal 25% less damage
  | 'thorns'        // deal N damage when attacked
  | 'rage'          // warrior: gain strength when losing HP
  | 'combo'         // rogue: count of cards played this turn
  | 'frozen'        // skip next turn (frost mage)
  | 'barricade';    // block doesn't reset at turn start

export interface CardEffect {
  type: EffectType;
  value: number;
  target?: 'self' | 'enemy';   // defaults to 'enemy' for damage/debuff, 'self' for block/buff
  buff?: BuffType;
  condition?: 'per_combo' | 'per_missing_hp' | 'per_poison'; // conditional scaling
}

export interface CardDefinition {
  id: string;
  name: string;
  class: PlayerClass;
  type: CardType;
  cost: number;
  effects: CardEffect[];
  description: string;
  upgraded: boolean;
  upgradeId?: string;     // ID of the upgraded version
  archetype?: string;     // 'berserker' | 'ironclad' | 'warlord' | etc.
  tier: 'basic' | 'common' | 'powerful'; // for reward pool sorting
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/cards/types.ts
git commit -m "feat: define card type system with effects and buffs"
```

---

### Task 5: Warrior Card Definitions

**Files:**
- Create: `src/shared/cards/warrior.ts`
- Create: `tests/shared/cards/warrior.test.ts`

- [ ] **Step 1: Write tests for warrior cards**

```typescript
import { describe, it, expect } from 'vitest';
import { WARRIOR_CARDS } from '@shared/cards/warrior';

describe('warrior cards', () => {
  it('has 16 basic cards', () => {
    const basic = WARRIOR_CARDS.filter(c => !c.archetype && !c.upgraded);
    expect(basic).toHaveLength(16);
  });

  it('has 5 Strikes and 4 Defends in basic', () => {
    const strikes = WARRIOR_CARDS.filter(c => c.name === 'Strike' && !c.upgraded);
    const defends = WARRIOR_CARDS.filter(c => c.name === 'Defend' && !c.upgraded);
    expect(strikes).toHaveLength(1); // 1 definition, used 5x in starter deck
    expect(defends).toHaveLength(1);
  });

  it('has 8 Berserker archetype cards', () => {
    const berserker = WARRIOR_CARDS.filter(c => c.archetype === 'berserker' && !c.upgraded);
    expect(berserker).toHaveLength(8);
  });

  it('has 8 Ironclad archetype cards', () => {
    const ironclad = WARRIOR_CARDS.filter(c => c.archetype === 'ironclad' && !c.upgraded);
    expect(ironclad).toHaveLength(8);
  });

  it('has 8 Warlord archetype cards', () => {
    const warlord = WARRIOR_CARDS.filter(c => c.archetype === 'warlord' && !c.upgraded);
    expect(warlord).toHaveLength(8);
  });

  it('all cards have class warrior', () => {
    expect(WARRIOR_CARDS.every(c => c.class === 'warrior')).toBe(true);
  });

  it('all non-upgraded cards have an upgradeId', () => {
    const nonUpgraded = WARRIOR_CARDS.filter(c => !c.upgraded);
    expect(nonUpgraded.every(c => c.upgradeId !== undefined)).toBe(true);
  });

  it('all upgraded versions exist', () => {
    const ids = new Set(WARRIOR_CARDS.map(c => c.id));
    const nonUpgraded = WARRIOR_CARDS.filter(c => !c.upgraded);
    for (const card of nonUpgraded) {
      expect(ids.has(card.upgradeId!), `Missing upgrade ${card.upgradeId} for ${card.id}`).toBe(true);
    }
  });

  it('card costs are 0-3', () => {
    expect(WARRIOR_CARDS.every(c => c.cost >= 0 && c.cost <= 3)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL

- [ ] **Step 3: Write warrior card definitions**

Create `src/shared/cards/warrior.ts` with all warrior cards. Each card has an id, name, class, type, cost, effects array, description, upgraded flag, upgradeId, archetype, and tier. Include both base and upgraded (`+`) versions. Follow the spec: 16 basic cards (Strike ×5 definition as 1 card used 5x, Defend ×4, Bash, Heavy Blow, War Cry, Shield Bash, Cleave, Intimidate, Iron Will) + 3 archetype sets of 8 cards each.

Example pattern for the first few cards:
```typescript
import type { CardDefinition } from './types';

export const WARRIOR_CARDS: CardDefinition[] = [
  // === BASIC CARDS ===
  {
    id: 'w_strike', name: 'Strike', class: 'warrior', type: 'attack',
    cost: 1, effects: [{ type: 'damage', value: 6 }],
    description: 'Deal 6 damage.', upgraded: false, upgradeId: 'w_strike_plus', tier: 'basic',
  },
  {
    id: 'w_strike_plus', name: 'Strike+', class: 'warrior', type: 'attack',
    cost: 1, effects: [{ type: 'damage', value: 9 }],
    description: 'Deal 9 damage.', upgraded: true, tier: 'basic',
  },
  {
    id: 'w_defend', name: 'Defend', class: 'warrior', type: 'skill',
    cost: 1, effects: [{ type: 'block', value: 5, target: 'self' }],
    description: 'Gain 5 Block.', upgraded: false, upgradeId: 'w_defend_plus', tier: 'basic',
  },
  {
    id: 'w_defend_plus', name: 'Defend+', class: 'warrior', type: 'skill',
    cost: 1, effects: [{ type: 'block', value: 8, target: 'self' }],
    description: 'Gain 8 Block.', upgraded: true, tier: 'basic',
  },
  {
    id: 'w_bash', name: 'Bash', class: 'warrior', type: 'attack',
    cost: 2, effects: [{ type: 'damage', value: 8 }, { type: 'debuff', value: 2, buff: 'vulnerable' }],
    description: 'Deal 8 damage. Apply 2 Vulnerable.', upgraded: false, upgradeId: 'w_bash_plus', tier: 'basic',
  },
  // ... continue for all 16 basic cards + upgrades
  // ... then 8 Berserker cards + upgrades
  // ... then 8 Ironclad cards + upgrades
  // ... then 8 Warlord cards + upgrades
  // Follow the same pattern: id, name, effects, upgrade version
];
```

Complete all cards following the spec names: Heavy Blow, War Cry, Shield Bash, Cleave, Intimidate, Iron Will (basic); Reckless Swing, Blood Fury, Rage Stack, Seeing Red, Frenzy, Wound Exploit, Berserk, Rampage (berserker); Fortress, Iron Skin, Barricade, Thorns, Counter Blow, Entrench, Shield Wall, Armor Up (ironclad); Battle Shout, Weaken, Disarm, Commanding Strike, Rally, Tactical Retreat, Overwhelm, Exploit Opening (warlord).

- [ ] **Step 4: Run tests**

Run: `npm test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/cards/warrior.ts tests/shared/cards/warrior.test.ts
git commit -m "feat: add warrior card definitions with all archetypes"
```

---

### Task 6: Mage Card Definitions

**Files:**
- Create: `src/shared/cards/mage.ts`
- Create: `tests/shared/cards/mage.test.ts`

- [ ] **Step 1: Write tests for mage cards**

Same structure as warrior tests — verify 16 basic, 8 Elementalist, 8 Arcanist, 8 Frost Mage, all class `mage`, all have upgradeId, all upgrades exist, costs 0-3.

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write mage card definitions**

Follow the exact same pattern as warrior cards. Use the spec names: Spark, Ward, Arcane Missile, Frost Bolt, Mana Shield, Concentrate, Focus, Meditation, Arcane Blast (basic); Fireball, Blizzard, Chain Lightning, Ignite, Frost Nova, Meteor, Combustion, Elemental Surge (elementalist); Siphon Power, Spell Echo, Arcane Intellect, Time Warp, Mana Surge, Recycle, Duplicate, Overcharge (arcanist); Deep Freeze, Ice Barrier, Glacial Spike, Frostbite, Shatter, Chill, Frozen Armor, Absolute Zero (frost_mage).

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/cards/mage.ts tests/shared/cards/mage.test.ts
git commit -m "feat: add mage card definitions with all archetypes"
```

---

### Task 7: Rogue Card Definitions

**Files:**
- Create: `src/shared/cards/rogue.ts`
- Create: `tests/shared/cards/rogue.test.ts`

- [ ] **Step 1-5: Same pattern as Tasks 5 and 6**

Use spec names: Stab, Dodge, Quick Slash, Backstab, Smoke Bomb, Preparation, Fan of Knives, Evade, Shadow Step (basic); Flurry, Death Mark, Execute, Combo Strike, Finishing Blow, Ambush, Coup de Grace, Chain Kill (assassin); Envenom, Toxic Blade, Deadly Brew, Noxious Gas, Venom Slash, Plague, Corrode, Virulent Wound (poisoner); Vanish, Cloak of Shadows, Shadowstep, Evasion, Blade Dance, Sleight of Hand, Tumble, Phantom Strike (shadow).

Commit message: `feat: add rogue card definitions with all archetypes`

---

### Task 8: Card Registry

**Files:**
- Create: `src/shared/cards/index.ts`
- Create: `tests/shared/cards/registry.test.ts`

- [ ] **Step 1: Write registry tests**

```typescript
import { describe, it, expect } from 'vitest';
import { getCardById, getCardsByClass, getStarterDeck, getRewardPool } from '@shared/cards';

describe('card registry', () => {
  it('looks up card by id', () => {
    const card = getCardById('w_strike');
    expect(card).toBeDefined();
    expect(card!.name).toBe('Strike');
  });

  it('returns undefined for unknown id', () => {
    expect(getCardById('nonexistent')).toBeUndefined();
  });

  it('gets all cards for a class', () => {
    const warriorCards = getCardsByClass('warrior');
    expect(warriorCards.length).toBeGreaterThan(0);
    expect(warriorCards.every(c => c.class === 'warrior')).toBe(true);
  });

  it('builds a starter deck for warrior', () => {
    const deck = getStarterDeck('warrior');
    expect(deck).toHaveLength(10);
    expect(deck.filter(id => id === 'w_strike')).toHaveLength(5);
    expect(deck.filter(id => id === 'w_defend')).toHaveLength(4);
    expect(deck.filter(id => id === 'w_bash')).toHaveLength(1);
  });

  it('builds a starter deck for mage', () => {
    const deck = getStarterDeck('mage');
    expect(deck).toHaveLength(10);
  });

  it('builds a starter deck for rogue', () => {
    const deck = getStarterDeck('rogue');
    expect(deck).toHaveLength(10);
  });

  it('gets small monster reward pool (non-starting basic + low-tier archetype)', () => {
    const pool = getRewardPool('warrior', 'small');
    expect(pool.length).toBeGreaterThan(0);
    // Should NOT contain Strike, Defend, or Bash (starter cards)
    expect(pool.some(c => c.id === 'w_strike')).toBe(false);
    expect(pool.some(c => c.id === 'w_defend')).toBe(false);
    expect(pool.some(c => c.id === 'w_bash')).toBe(false);
    // Should not contain upgraded cards
    expect(pool.every(c => !c.upgraded)).toBe(true);
  });

  it('gets rare monster reward pool (powerful archetype)', () => {
    const pool = getRewardPool('warrior', 'rare');
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every(c => c.tier === 'powerful')).toBe(true);
    expect(pool.every(c => !c.upgraded)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write registry**

```typescript
import type { CardDefinition } from './types';
import type { PlayerClass } from '../types';
import { WARRIOR_CARDS } from './warrior';
import { MAGE_CARDS } from './mage';
import { ROGUE_CARDS } from './rogue';

const ALL_CARDS: CardDefinition[] = [...WARRIOR_CARDS, ...MAGE_CARDS, ...ROGUE_CARDS];
const CARD_MAP = new Map<string, CardDefinition>(ALL_CARDS.map(c => [c.id, c]));

export function getCardById(id: string): CardDefinition | undefined {
  return CARD_MAP.get(id);
}

export function getCardsByClass(playerClass: PlayerClass): CardDefinition[] {
  return ALL_CARDS.filter(c => c.class === playerClass);
}

const STARTER_CARDS: Record<PlayerClass, { attack: string; defend: string; signature: string }> = {
  warrior: { attack: 'w_strike', defend: 'w_defend', signature: 'w_bash' },
  mage:    { attack: 'm_spark',  defend: 'm_ward',   signature: 'm_arcane_missile' },
  rogue:   { attack: 'r_stab',   defend: 'r_dodge',  signature: 'r_backstab' },
};

export function getStarterDeck(playerClass: PlayerClass): string[] {
  const s = STARTER_CARDS[playerClass];
  return [
    ...Array(5).fill(s.attack),
    ...Array(4).fill(s.defend),
    s.signature,
  ];
}

export function getRewardPool(playerClass: PlayerClass, monsterType: 'small' | 'rare'): CardDefinition[] {
  const starter = STARTER_CARDS[playerClass];
  const starterIds = new Set([starter.attack, starter.defend, starter.signature]);

  const classCards = ALL_CARDS.filter(c => c.class === playerClass && !c.upgraded);

  if (monsterType === 'small') {
    return classCards.filter(c =>
      (c.tier === 'basic' && !starterIds.has(c.id)) || c.tier === 'common'
    );
  } else {
    return classCards.filter(c => c.tier === 'powerful');
  }
}

export { ALL_CARDS };
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/shared/cards/index.ts tests/shared/cards/registry.test.ts
git commit -m "feat: add card registry with starter decks and reward pools"
```

---

### Task 9: Deck Management

**Files:**
- Create: `src/engine/deck.ts`
- Create: `tests/engine/deck.test.ts`

- [ ] **Step 1: Write deck tests**

```typescript
import { describe, it, expect } from 'vitest';
import { createDeck, drawCards, discardHand, shuffleDiscardIntoDraw } from '@engine/deck';

describe('deck management', () => {
  it('creates a shuffled deck from card IDs', () => {
    const ids = ['a', 'b', 'c', 'd', 'e'];
    const deck = createDeck(ids);
    expect(deck.drawPile).toHaveLength(5);
    expect(deck.hand).toHaveLength(0);
    expect(deck.discardPile).toHaveLength(0);
    // Contains same cards (order may differ)
    expect([...deck.drawPile].sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('draws cards from draw pile into hand', () => {
    const deck = { drawPile: ['a', 'b', 'c', 'd', 'e'], hand: [] as string[], discardPile: [] as string[] };
    const result = drawCards(deck, 3);
    expect(result.hand).toHaveLength(3);
    expect(result.drawPile).toHaveLength(2);
  });

  it('shuffles discard into draw when draw pile is insufficient', () => {
    const deck = { drawPile: ['a'], hand: [] as string[], discardPile: ['b', 'c', 'd'] };
    const result = drawCards(deck, 3);
    expect(result.hand).toHaveLength(3);
    expect(result.drawPile.length + result.hand.length + result.discardPile.length).toBe(4);
  });

  it('discards entire hand', () => {
    const deck = { drawPile: ['a'], hand: ['b', 'c'], discardPile: ['d'] };
    const result = discardHand(deck);
    expect(result.hand).toHaveLength(0);
    expect(result.discardPile).toEqual(['d', 'b', 'c']);
  });

  it('draws 0 cards when entire deck is in hand', () => {
    const deck = { drawPile: [] as string[], hand: ['a', 'b', 'c'], discardPile: [] as string[] };
    const result = drawCards(deck, 5);
    // Can only draw 0 since all cards are in hand
    expect(result.hand).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write deck operations**

```typescript
export interface DeckState {
  drawPile: string[];
  hand: string[];
  discardPile: string[];
}

export function createDeck(cardIds: string[]): DeckState {
  return {
    drawPile: shuffle([...cardIds]),
    hand: [],
    discardPile: [],
  };
}

export function drawCards(deck: DeckState, count: number): DeckState {
  const drawPile = [...deck.drawPile];
  const hand = [...deck.hand];
  let discardPile = [...deck.discardPile];

  for (let i = 0; i < count; i++) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) break;
      drawPile.push(...shuffle(discardPile));
      discardPile = [];
    }
    hand.push(drawPile.pop()!);
  }

  return { drawPile, hand, discardPile };
}

export function discardHand(deck: DeckState): DeckState {
  return {
    drawPile: [...deck.drawPile],
    hand: [],
    discardPile: [...deck.discardPile, ...deck.hand],
  };
}

export function discardCard(deck: DeckState, cardId: string): DeckState {
  const handIndex = deck.hand.indexOf(cardId);
  if (handIndex === -1) return deck;
  const hand = [...deck.hand];
  hand.splice(handIndex, 1);
  return {
    drawPile: [...deck.drawPile],
    hand,
    discardPile: [...deck.discardPile, cardId],
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export { shuffle };
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/deck.ts tests/engine/deck.test.ts
git commit -m "feat: add deck management with draw, discard, shuffle"
```

---

### Task 10: Card Effects Resolution

**Files:**
- Create: `src/engine/card-effects.ts`
- Create: `tests/engine/card-effects.test.ts`

- [ ] **Step 1: Write card effect tests**

Test cases:
- Damage effect reduces target HP (after block)
- Block effect adds block to self
- Buff effect adds/stacks buff on self
- Debuff effect adds/stacks debuff on target
- Vulnerable increases damage taken by 50%
- Weak reduces damage dealt by 25%
- Poison ticks damage at end of turn
- Damage absorbed by block first, remainder hits HP
- Draw effect draws cards

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write card effects engine**

Create `src/engine/card-effects.ts` with:
- `resolveCardEffects(card, attacker, defender, deck)` — processes each effect in the card's effects array
- `applyDamage(value, attacker, defender)` — handles block, vulnerable, weak modifiers
- `applyBuff(target, buff, value)` — stacks buffs
- `tickPoison(target)` — apply poison damage at end of turn, reduce stacks by 1
- `tickBurn(target)` — apply burn damage at end of turn
- `resetBlock(player)` — set block to 0 (called at start of turn)

All functions are pure — take state in, return new state out.

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/card-effects.ts tests/engine/card-effects.test.ts
git commit -m "feat: add card effects resolution engine"
```

---

### Task 11: Monster Definitions & AI

**Files:**
- Create: `src/engine/monsters.ts`
- Create: `tests/engine/monsters.test.ts`

- [ ] **Step 1: Write monster tests**

Test cases:
- Small monster has HP in 30-45 range
- Rare monster has HP in 60-80 range
- Monster AI follows repeating pattern
- `getMonsterIntent(monster)` returns next action based on patternIndex
- Pattern cycles back to start after completing
- Monster actions include attack, defend, buff

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write monster definitions**

```typescript
export interface MonsterAction {
  type: 'attack' | 'defend' | 'buff';
  value: number;
  buff?: string;
}

export interface MonsterDefinition {
  id: string;
  name: string;
  tier: 'small' | 'rare';
  hp: { min: number; max: number };
  pattern: MonsterAction[];
}

export const MONSTERS: MonsterDefinition[] = [
  {
    id: 'goblin', name: 'Goblin', tier: 'small',
    hp: { min: 30, max: 35 },
    pattern: [
      { type: 'attack', value: 6 },
      { type: 'attack', value: 8 },
      { type: 'defend', value: 4 },
    ],
  },
  {
    id: 'slime', name: 'Slime', tier: 'small',
    hp: { min: 35, max: 40 },
    pattern: [
      { type: 'attack', value: 5 },
      { type: 'buff', value: 2, buff: 'strength' },
      { type: 'attack', value: 7 },
    ],
  },
  // ... more small monsters (3-4 total)
  {
    id: 'dragon', name: 'Dragon', tier: 'rare',
    hp: { min: 65, max: 80 },
    pattern: [
      { type: 'attack', value: 12 },
      { type: 'buff', value: 3, buff: 'strength' },
      { type: 'attack', value: 8 },
      { type: 'attack', value: 15 },
    ],
  },
  // ... more rare monsters (2-3 total)
];

export function createMonsterState(definition: MonsterDefinition): MonsterState { ... }
export function getMonsterIntent(monster: MonsterState, definition: MonsterDefinition): MonsterAction { ... }
export function advanceMonsterPattern(monster: MonsterState, definition: MonsterDefinition): MonsterState { ... }
export function getRandomMonster(tier: 'small' | 'rare'): MonsterDefinition { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/monsters.ts tests/engine/monsters.test.ts
git commit -m "feat: add monster definitions and AI patterns"
```

---

### Task 12: Combat Engine

**Files:**
- Create: `src/engine/combat.ts`
- Create: `tests/engine/combat.test.ts`

- [ ] **Step 1: Write combat tests**

Test cases:
- `createPvECombat(player, monster)` initializes combat state correctly
- `createPvPCombat(player1, player2)` initializes with 4 max rounds, 20 damage cap
- `startTurn(combat, player)` resets block, draws 5 cards, sets energy to turnNumber + 1
- `playCard(combat, player, cardId)` deducts energy, resolves effects, discards card
- `playCard` fails if not enough energy
- `playCard` fails if not player's turn
- `endTurn(combat, player)` discards hand, advances to next turn
- PvE: monster acts after player ends turn
- PvP: alternates between players, increments round after both act
- PvP ends when damage cap reached
- PvP ends after 4 rounds
- Energy scales: turn 1 = 2, turn 2 = 3, turn 3 = 4
- `fleePvE(combat, player)` costs 10 HP, not available turn 1
- Player death during combat sets isComplete

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write combat engine**

```typescript
import { STARTING_ENERGY, ENERGY_PER_TURN, CARDS_PER_DRAW, PVP_DAMAGE_CAP, PVP_MAX_ROUNDS, FLEE_HP_COST } from '@shared/constants';
import { drawCards, discardHand, discardCard } from './deck';
import { resolveCardEffects, resetBlock, tickPoison } from './card-effects';
import { getCardById } from '@shared/cards';
import type { CombatState, Player, MonsterState } from '@shared/types';

export function createPvECombat(playerId: string, monster: MonsterState): CombatState { ... }
export function createPvPCombat(player1Id: string, player2Id: string, initiatorId: string): CombatState { ... }
export function getEnergyForTurn(turnNumber: number): number {
  return STARTING_ENERGY + (turnNumber - 1) * ENERGY_PER_TURN;
}
export function startTurn(combat: CombatState, player: Player): { combat: CombatState; player: Player } { ... }
export function playCard(combat: CombatState, player: Player, cardId: string, target: Player | MonsterState): { combat: CombatState; player: Player; target: Player | MonsterState } | { error: string } { ... }
export function endTurn(combat: CombatState, player: Player): { combat: CombatState; player: Player } { ... }
export function fleePvE(combat: CombatState, player: Player): { combat: CombatState; player: Player } | { error: string } { ... }
export function checkCombatEnd(combat: CombatState, players: Player[], monster?: MonsterState): CombatState { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/combat.ts tests/engine/combat.test.ts
git commit -m "feat: add combat engine with PvE and PvP support"
```

---

### Task 13: Map Generator

**Files:**
- Create: `src/engine/map-generator.ts`
- Create: `tests/engine/map-generator.test.ts`

- [ ] **Step 1: Write map generator tests**

Test cases:
- `generateMap(width, height)` returns a GameMap with correct dimensions
- Map has walkable paths connecting all areas
- Map has impassable tiles (rocks, water) but not blocking all movement
- `placeEvents(map, playerCount)` places correct number of events per the scaling table
- Events are only placed on walkable tiles
- Events are spread across the map (not clustered)
- `getSpawnPoints(map, playerCount)` returns positions around map edges
- Spawn points are maximally distant from each other
- Each spawn has 2-3 events within 5-tile radius

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write map generator**

```typescript
import type { GameMap, Tile, EventTile, Position } from '@shared/types';
import { MAP_WIDTH, MAP_HEIGHT, getEventDistributionForPlayers } from '@shared/constants';

export function generateMap(width: number, height: number, seed?: number): GameMap { ... }
export function placeEvents(map: GameMap, playerCount: number): EventTile[] { ... }
export function getSpawnPoints(map: GameMap, playerCount: number, events: EventTile[]): Position[] { ... }
```

Map generation approach:
1. Fill with grass tiles
2. Generate random paths using random walk
3. Place rock clusters and water features (ensuring connectivity)
4. Validate all walkable tiles are reachable via flood fill
5. Place events using the distribution table, ensuring spacing between events

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/map-generator.ts tests/engine/map-generator.test.ts
git commit -m "feat: add procedural map generator with event placement"
```

---

### Task 14: Zone Shrinking

**Files:**
- Create: `src/engine/zone.ts`
- Create: `tests/engine/zone.test.ts`

- [ ] **Step 1: Write zone tests**

Test cases:
- `getZonePhase(elapsed)` returns correct phase for time ranges
- `getZoneBoundary(mapWidth, mapHeight, phase)` shrinks correctly per phase
- `isInsideZone(position, boundary)` returns true/false correctly
- `getZoneDamage(elapsed, isInZone)` returns 0 inside, 5/sec outside, 2/sec in sudden death
- `destroyEventsOutsideZone(events, boundary)` deactivates events outside
- `getNearestSafePosition(position, boundary)` returns closest in-zone tile
- Phase 0 covers full map
- Phase 5 (sudden death) covers ~5% of map

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write zone logic**

```typescript
import type { Position, ZoneBoundary, EventTile } from '@shared/types';
import { ZONE_PHASES, ZONE_DAMAGE_PER_SECOND, SUDDEN_DEATH_DAMAGE_PER_SECOND, MAP_WIDTH, MAP_HEIGHT } from '@shared/constants';

export function getZonePhase(elapsedSeconds: number): number { ... }
export function getZoneBoundary(mapWidth: number, mapHeight: number, phase: number): ZoneBoundary { ... }
export function isInsideZone(position: Position, boundary: ZoneBoundary): boolean { ... }
export function getZoneDamage(elapsedSeconds: number, isInZone: boolean): number { ... }
export function destroyEventsOutsideZone(events: EventTile[], boundary: ZoneBoundary): EventTile[] { ... }
export function getNearestSafePosition(position: Position, boundary: ZoneBoundary): Position { ... }
export function isZoneWarning(elapsedSeconds: number): boolean { ... }
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/zone.ts tests/engine/zone.test.ts
git commit -m "feat: add zone shrinking system with damage and phase logic"
```

---

### Task 15: Event System

**Files:**
- Create: `src/engine/events.ts`
- Create: `tests/engine/events.test.ts`

- [ ] **Step 1: Write event tests**

Test cases:
- `resolveCampfire(player)` heals 25-30 HP, caps at maxHp
- `resolveBlacksmith(player, cardId)` upgrades card to its plus version
- `resolveBlacksmith` fails for already-upgraded cards
- `resolveRandomEvent(player, eventPool)` returns a random event from the three pools
- Random event pool weights: 50% shared, 25% class, 25% gambling
- `resolveWanderingMerchant(player)` costs 15 HP, offers 3 rare cards
- `resolveShrineOfSacrifice(player, cardId)` removes card from deck
- `resolveAncientChest(player)` creates a mini-boss fight
- `resolveSoulBargain(player)` reduces maxHp by 15, grants best card
- Campfire cannot heal above maxHp
- Healing Spring heals 15 and upgrades random card

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write event handlers**

```typescript
import type { Player } from '@shared/types';
import type { CardDefinition } from '@shared/cards/types';
import { CAMPFIRE_HEAL, MAX_HP_CAP } from '@shared/constants';
import { getCardById, getRewardPool } from '@shared/cards';

export interface EventResult {
  player: Player;
  cardChoices?: CardDefinition[];  // cards to pick from
  combat?: { monsterId: string };  // fight triggered
  message: string;
}

export function resolveCampfire(player: Player): EventResult { ... }
export function resolveBlacksmith(player: Player, cardId: string): EventResult { ... }
export function resolveRandomEvent(player: Player): EventResult { ... }
// ... individual random event resolvers
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/events.ts tests/engine/events.test.ts
git commit -m "feat: add event system with campfire, blacksmith, and random events"
```

---

### Task 16: Event Alternation Rule

**Files:**
- Create: `src/engine/event-alternation.ts`
- Create: `tests/engine/event-alternation.test.ts`

- [ ] **Step 1: Write alternation tests**

```typescript
import { describe, it, expect } from 'vitest';
import { canUseNonFightEvent, recordNonFightEvent, recordFightEvent } from '@engine/event-alternation';
import type { Player } from '@shared/types';

function makePlayer(overrides: Partial<Player> = {}): Player {
  return {
    id: 'p1', name: 'Test', class: 'warrior', hp: 100, maxHp: 100,
    position: { x: 0, y: 0 }, deck: [], hand: [], drawPile: [], discardPile: [],
    block: 0, isAlive: true, freeNonFightEvents: 3, needsFight: false,
    pvpCooldowns: {}, stats: { damageDealt: 0, cardsPlayed: 0, monstersKilled: 0, eventsClaimed: 0 },
    ...overrides,
  };
}

describe('event alternation', () => {
  it('allows first 3 non-fight events freely', () => {
    let player = makePlayer();
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // freeNonFightEvents: 2
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 1
    expect(canUseNonFightEvent(player)).toBe(true);
    player = recordNonFightEvent(player); // 0, needsFight: true
    expect(canUseNonFightEvent(player)).toBe(false);
  });

  it('requires fight after 3 free events', () => {
    let player = makePlayer({ freeNonFightEvents: 0, needsFight: true });
    expect(canUseNonFightEvent(player)).toBe(false);
    player = recordFightEvent(player);
    expect(canUseNonFightEvent(player)).toBe(true);
  });

  it('fight unlocks next non-fight event', () => {
    let player = makePlayer({ freeNonFightEvents: 0, needsFight: true });
    player = recordFightEvent(player);
    expect(player.needsFight).toBe(false);
    player = recordNonFightEvent(player);
    expect(player.needsFight).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

- [ ] **Step 3: Write alternation logic**

```typescript
import type { Player } from '@shared/types';

export function canUseNonFightEvent(player: Player): boolean {
  if (player.freeNonFightEvents > 0) return true;
  return !player.needsFight;
}

export function recordNonFightEvent(player: Player): Player {
  if (player.freeNonFightEvents > 0) {
    const remaining = player.freeNonFightEvents - 1;
    return {
      ...player,
      freeNonFightEvents: remaining,
      needsFight: remaining === 0,
    };
  }
  return { ...player, needsFight: true };
}

export function recordFightEvent(player: Player): Player {
  return { ...player, needsFight: false };
}
```

- [ ] **Step 4: Run tests**

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/engine/event-alternation.ts tests/engine/event-alternation.test.ts
git commit -m "feat: add event alternation rule enforcement"
```

---

### Task 17: Integration Tests & Cleanup

**Files:**
- Create: `tests/engine/integration.test.ts`
- Delete: `tests/smoke.test.ts`

- [ ] **Step 1: Write integration tests**

Test a full mini-game flow:
1. Create a player with starter deck
2. Generate a map with events
3. Start a PvE combat against a small monster
4. Play through combat (draw, play cards, end turns)
5. Monster dies, player picks a reward card
6. Player walks to campfire, heals
7. Verify event alternation is tracked
8. Start a PvP combat between two players
9. Play through 4 rounds
10. Verify damage cap is enforced

- [ ] **Step 2: Run integration tests**

Expected: PASS

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 4: Delete smoke test, commit**

```bash
rm tests/smoke.test.ts
git add -A
git commit -m "feat: add integration tests, remove smoke test"
```
