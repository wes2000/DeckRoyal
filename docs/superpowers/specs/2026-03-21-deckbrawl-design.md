# DeckBrawl — Game Design Specification

A multiplayer deckbuilder battle royale with Pokemon-style overworld exploration. Players build decks by fighting monsters and claiming events on a shrinking map, then battle each other until one player remains.

## 1. Game Overview

- **Genre:** Deckbuilder battle royale
- **Players:** 0–8 (solo practice to full lobby)
- **Game length:** 15–20 minutes
- **Platform:** Web-based (browser)
- **Art style:** Pokemon Red/Blue pixel art (16–32px sprites, nearest-neighbor scaling)

## 2. System Architecture

### Server-Authoritative Model

All game logic runs on the server. Clients send inputs, server validates and broadcasts state updates.

- **Frontend:** Phaser.js (2D game framework)
  - Tilemap rendering, sprite animations, camera follow
  - Combat card UI (hand display, drag-to-play, HP/energy bars)
  - WebSocket client for input/state sync
- **Backend:** Node.js + Express + ws (WebSocket library)
  - Game Manager: lobby system, game lifecycle, player sessions
  - World Engine: map generation, event placement, zone shrinking, collision detection
  - Combat Engine: turn management, card resolution, damage calculation (PvP and PvE)
  - Card System: class definitions, deck management, card effects engine
- **Deployment:** Railway (all-in-one — frontend and game server)

### Data Flow

- **Client → Server:** `move(direction)`, `playCard(cardId, target)`, `endTurn()`, `joinLobby(code)`, `startGame()`
- **Server → Client:** `gameState(full/delta)`, `combatState()`, `eventResult()`, `playerEliminated()`, `gameOver()`

## 3. Lobby & Game Flow

### Lobby

1. Host visits the site, clicks "Create Game," receives a unique lobby URL (e.g., `yourgame.up.railway.app/game/ABC123`).
2. Host shares the link with friends.
3. Players join via the link, enter a display name, and pick a class (Warrior, Mage, or Rogue). Multiple players may pick the same class.
4. Host sees a "Start Game" button. The game starts when the host clicks it.

### Game Lifecycle

1. **Map generation:** Server generates the ~60×60 tile map, places events, assigns player spawn points evenly distributed around the map edges (maximizing distance between players). Each spawn has 2–3 nearby events.
2. **Countdown:** 3-second countdown, then the game begins.
3. **Gameplay:** Players explore with WASD, claim events, fight monsters, build decks, and engage in PvP. Zone shrinks on schedule.
4. **Elimination:** Players at 0 HP are eliminated and enter spectator mode (can follow any living player's camera, see the kill feed).
5. **Victory:** Last player standing wins. Victory screen shows stats (damage dealt, cards played, monsters killed, events claimed). All players see a "Return to Lobby" button.

## 4. Map & World Design

### Map Properties

- **Size:** ~60×60 tile grid
- **Navigation:** WASD movement, tile-based, smooth camera follow centered on the player
- **Visibility:** Full — all players can see all other players on the map at all times
- **Terrain:** Grass, paths, rocks/trees (impassable), water (impassable) — simple procedural generation

### Event Distribution (8-player game)

| Event | Count | Type |
|-------|-------|------|
| Campfire | 6 | Non-fight |
| Blacksmith | 4 | Non-fight |
| Small Monster | 10 | Fight |
| Rare Monster | 4 | Fight |
| Random (?) | 6 | Varies |
| **Total** | **30** | |

Events scale proportionally with player count (e.g., 4 players ≈ 18 events). Events disappear when used by a player — other players can see they're gone.

### Zone Shrinking

The map shrinks in 4 phases with a visible wall/border. Tiles outside the zone become impassable and deal 5 HP/sec damage. Events outside the zone are destroyed.

| Time | Zone | Map Available |
|------|------|---------------|
| 0:00–5:00 | Full map | 100% |
| 5:00–5:30 | Warning — border flashes | 100% |
| 5:30 | Zone 1 | ~75% |
| 9:00 | Zone 2 | ~50% |
| 12:00 | Zone 3 | ~25% |
| 15:00 | Zone 4 (final arena) | ~15% |

### Player Spawning

Players spawn evenly distributed around the map edges, maximizing initial distance from each other. Each spawn point has 2–3 nearby events to give opening choices.

## 5. Combat System

### Core Mechanics

- **Energy:** Scaling — start at 2 energy on turn 1, gain +1 per turn, no cap. (Turn 1: 2, Turn 2: 3, Turn 3: 4, Turn N: N+1)
- **Draw:** 5 cards per turn from your draw pile
- **Card types:** Attack (deal damage), Skill (block/buff/utility), Power (persistent effects)
- **Card costs:** 0–3 energy
- **Block:** Temporary shield that absorbs damage. Resets to 0 at the start of your next turn.
- **Discard:** Remaining hand is discarded at end of turn. When the draw pile is empty, shuffle the discard pile into the draw pile.

### PvE Combat (Monster Fights)

1. Player walks onto a monster's tile — combat begins.
2. **Turn sequence:** Draw 5 → gain energy → play cards → end turn → monster acts → repeat.
3. Fight continues until the monster dies.
4. Monster behavior follows predefined patterns (attack/defend cycles, buff phases).

**Small Monsters:**
- HP: 30–45
- Damage: 5–10 per turn
- Behavior: Simple 2–3 move pattern
- Reward: Pick 1 of 3 cards (basic or low-tier archetype cards from your class)

**Rare Monsters:**
- HP: 60–80
- Damage: 10–18 per turn
- Behavior: Multi-phase, buffs/debuffs
- Reward: Pick 1 of 3 cards (powerful archetype cards from your class)

### PvP Combat (Player vs Player)

1. **Trigger:** Walk into another player's tile — combat begins automatically.
2. **Turns:** Alternating — the initiator (player who walked in) goes first.
3. **Rounds:** Fixed 4 rounds. Each round = Player A's turn + Player B's turn.
4. **Damage cap:** 20 HP max per player per fight. If a player reaches 20 damage taken, the fight ends immediately.
5. **After combat:** Both players return to the overworld at adjacent tiles. Damage persists.
6. **Death:** If a player reaches 0 HP during a PvP fight, they are eliminated.

## 6. Event Alternation Rule

Players must alternate between fight and non-fight events to prevent pure passive play.

- **Opening phase:** The first 3 non-fight events are free (no restriction).
- **After 3 free events:** The player must complete a fight (monster OR PvP) before using another non-fight event.
- **Locked events:** Non-fight events the player can't use show a lock icon. The player can see them but cannot interact.
- **PvP counts:** Walking into another player and completing a PvP fight satisfies the fight requirement.
- **Random (?) events:** If the ? resolves as a fight, it counts as the required fight. If it resolves as a non-fight, it counts as a non-fight use.

## 7. Events & Random Encounters

### Campfire (Non-Fight)

- **Effect:** Heal 25–30 HP.
- **Interaction:** Walk onto tile → healing animation → HP restored.
- Disappears after use.

### Blacksmith (Non-Fight)

- **Effect:** Upgrade 1 card in your deck.
- **Interaction:** Walk onto tile → view your deck → pick a card to upgrade.
- Each card has a predefined upgraded version (e.g., Strike 6 dmg → Strike+ 9 dmg, Fireball 8 dmg → Fireball+ 11 dmg + 2 Burn).
- Disappears after use.

### Random (?) Events

When a player steps on a ? tile, a random event is drawn from three pools:

**Shared Pool (~50% chance):**
- **Wandering Merchant:** Trade 15 HP for a powerful card choice (pick 1 of 3 rare).
- **Shrine of Sacrifice:** Remove a card from your deck (deck thinning).
- **Ancient Chest:** Fight a mini-boss (45 HP) → get 2 card choices instead of 1.
- **Healing Spring:** Heal 15 HP and upgrade a random card in your deck.
- **Armory:** Upgrade 2 cards but take 10 damage.
- **Dark Altar:** Transform a card into a random card of higher rarity.

**Class-Specific Pool (~25% chance):**
- **Warrior — War Memorial:** Gain 10 max HP and a random Berserker card.
- **Mage — Arcane Library:** Pick 2 cards from any of your archetype pools.
- **Rogue — Black Market:** Steal a random card from another player's class pool.

**Gambling Pool (~25% chance):**
- **Cursed Coin Flip:** 50/50 — gain 2 powerful cards OR lose 25 HP.
- **Mysterious Potion:** Random effect — full heal, upgrade all cards, OR add 3 curse cards to deck.
- **Double or Nothing:** Fight a rare monster with 2× HP. Win → 2 powerful cards. Lose → lose 30 HP.
- **Soul Bargain:** Permanently lose 15 max HP. Gain the most powerful card from your class.

## 8. Class Design

Three classes at launch. Each class has 16 basic cards and 2–3 archetype sets of 8 synergy cards.

### Starting Deck (10 cards, all classes)

- 5× class basic attack (Strike / Spark / Stab)
- 4× class basic defense (Defend / Ward / Dodge)
- 1× class signature card (Bash / Arcane Missile / Backstab)

### Warrior — Frontline fighter, high damage, moderate defense

**16 Basic Cards:** Strike (×5), Defend (×4), Bash, Heavy Blow, War Cry, Shield Bash, Cleave, Intimidate, Iron Will

**Archetype 1 — Berserker (Offense):** High-risk attacks that scale with low HP or rage stacks.
Cards: Reckless Swing, Blood Fury, Rage Stack, Seeing Red, Frenzy, Wound Exploit, Berserk, Rampage

**Archetype 2 — Ironclad (Defense):** Heavy block, thorns, and counterattack.
Cards: Fortress, Iron Skin, Barricade, Thorns, Counter Blow, Entrench, Shield Wall, Armor Up

**Archetype 3 — Warlord (Utility):** Buff/debuff, card draw, and disruption.
Cards: Battle Shout, Weaken, Disarm, Commanding Strike, Rally, Tactical Retreat, Overwhelm, Exploit Opening

### Mage — Spellcaster, burst damage, fragile, card manipulation

**16 Basic Cards:** Spark (×5), Ward (×4), Arcane Missile, Frost Bolt, Mana Shield, Concentrate, Focus, Meditation, Arcane Blast

**Archetype 1 — Elementalist (Offense):** Fire and ice spells, AoE damage, burn stacks.
Cards: Fireball, Blizzard, Chain Lightning, Ignite, Frost Nova, Meteor, Combustion, Elemental Surge

**Archetype 2 — Arcanist (Utility):** Card draw, deck manipulation, energy tricks.
Cards: Siphon Power, Spell Echo, Arcane Intellect, Time Warp, Mana Surge, Recycle, Duplicate, Overcharge

**Archetype 3 — Frost Mage (Control):** Freeze, slow, and stall — deny enemy turns.
Cards: Deep Freeze, Ice Barrier, Glacial Spike, Frostbite, Shatter, Chill, Frozen Armor, Absolute Zero

### Rogue — Trickster, combos, poison, card cycling

**16 Basic Cards:** Stab (×5), Dodge (×4), Quick Slash, Backstab, Smoke Bomb, Preparation, Fan of Knives, Evade, Shadow Step

**Archetype 1 — Assassin (Offense):** Combo chains — cards get stronger when played in sequence.
Cards: Flurry, Death Mark, Execute, Combo Strike, Finishing Blow, Ambush, Coup de Grace, Chain Kill

**Archetype 2 — Poisoner (DoT):** Stack poison that ticks damage each turn.
Cards: Envenom, Toxic Blade, Deadly Brew, Noxious Gas, Venom Slash, Plague, Corrode, Virulent Wound

**Archetype 3 — Shadow (Evasion):** Dodge, energy generation, card draw — outlast opponents.
Cards: Vanish, Cloak of Shadows, Shadowstep, Evasion, Blade Dance, Sleight of Hand, Tumble, Phantom Strike

## 9. Card Acquisition

- **Small monster reward:** Pick 1 of 3 cards from your class's basic or low-tier archetype pool.
- **Rare monster reward:** Pick 1 of 3 cards from your class's powerful archetype pool.
- **Random events:** Varies — may offer card choices, card upgrades, card removal, or card transformation.
- All card choices are drawn from the player's own class pool. Players naturally specialize into an archetype as they make choices throughout the game.

## 10. UI Design

### Overworld HUD

- **Top-left:** Player info — class icon, name, HP bar, deck card count, fights completed.
- **Top-right:** Game timer, zone shrink countdown, players alive count.
- **Bottom-left:** Event lock status — "Non-fight event available" or "Fight required" with free events counter.
- **Bottom-right:** Minimap — player dots (color-coded), zone boundary, event markers.
- **Screen edges:** Red tint when near the zone boundary.

### Combat UI

- **Top center:** Enemy sprite, HP bar, and intent indicator (shows what the enemy will do next turn, StS-style).
- **Bottom center:** 5-card hand — cards show cost, name, and effect text. Click to play.
- **Bottom-left:** Player HP bar, block counter, draw pile count, discard pile count.
- **Bottom-right:** Energy display (current/max for this turn), End Turn button.

### Lobby UI

- Game title and lobby code at top.
- Player list showing name, class selection, and host crown icon.
- Class selection buttons (Warrior / Mage / Rogue) with icons.
- Start Game button (host only).
- Empty slots showing "Waiting for player..."

### Spectator Mode

- Full map view with all surviving players visible.
- Click a player's icon to follow their camera.
- Watch combat encounters live.
- Kill feed / event log in the corner.
- No chat or interaction — observation only.

## 11. Visual Style

- **Sprites:** 16×16 or 32×32 pixel art, Pokemon Red/Blue aesthetic.
- **Color palette:** Limited, muted tones with bright accents for events and players.
- **Camera:** Centered on player, smooth follow with WASD movement.
- **Cards:** Simple styled boxes with clear cost, name, and effect text.
- **Animations:** Minimal — tile-to-tile movement, attack flashes, heal sparkles.
- **Rendering:** Low resolution rendered and scaled up with nearest-neighbor interpolation for crisp pixels.
