# DeckBrawl — Game Design Specification

A multiplayer deckbuilder battle royale with Pokemon-style overworld exploration. Players build decks by fighting monsters and claiming events on a shrinking map, then battle each other until one player remains.

## 1. Game Overview

- **Genre:** Deckbuilder battle royale
- **Players:** 1–8 (solo practice to full lobby)
- **Game length:** 15–20 minutes
- **Platform:** Web-based (browser)
- **Art style:** Pokemon Red/Blue pixel art (16–32px sprites, nearest-neighbor scaling)
- **Starting HP:** 100 (all classes)

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
- **Navigation:** WASD movement, tile-based, smooth camera follow centered on the player. Movement speed: 5 tiles per second. Cardinal directions only (no diagonal movement).
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

Events scale with player count using the formula: `total_events = round(player_count * 3.75)`. Lookup table:

| Players | Events |
|---------|--------|
| 1 | 8 |
| 2 | 11 |
| 3 | 14 |
| 4 | 18 |
| 5 | 21 |
| 6 | 24 |
| 7 | 27 |
| 8 | 30 |

Event type ratios remain proportional to the 8-player distribution, using largest-remainder rounding: calculate each type proportionally, floor all values, then distribute remaining slots one at a time to the types with the largest fractional remainders until the total matches. Events disappear when used by a player — other players can see they're gone.

### Zone Shrinking

The map shrinks in 4 phases with a visible wall/border. Tiles outside the zone become impassable and deal 5 HP/sec damage. Events outside the zone are destroyed.

**Zone and combat interaction:** Zone damage is paused during combat encounters (both PvP and PvE). However, if the zone shrinks past a combat tile, the fight ends immediately when the current turn completes. Both players (or the player in PvE) are forcibly moved to the nearest safe tile inside the zone. In PvE, the monster escapes (event is consumed with no reward). In PvP, damage dealt so far persists.

| Time | Zone | Map Available |
|------|------|---------------|
| 0:00–5:00 | Full map | 100% |
| 5:00–5:30 | Warning — border flashes | 100% |
| 5:30 | Zone 1 | ~75% |
| 9:00 | Zone 2 | ~50% |
| 12:00 | Zone 3 | ~25% |
| 15:00 | Zone 4 (final arena) | ~15% |
| 18:00 | Zone 5 (sudden death) | ~5% — a tiny arena. All remaining players take 2 HP/sec damage until one player remains. |

### Player Spawning

Players spawn evenly distributed around the map edges, maximizing initial distance from each other. Each spawn point has 2–3 nearby events to give opening choices.

## 5. Combat System

### Player Stats

- **Starting HP:** 100 (all classes)
- **Max HP cap:** 120 (can be increased by events like War Memorial, but cannot exceed 120)

### Core Mechanics

- **Energy:** Scaling — start at 2 energy on turn 1, gain +1 per turn, no cap. (Turn 1: 2, Turn 2: 3, Turn 3: 4, Turn N: N+1). Each player tracks their own independent turn counter for energy calculation. In PvP, both players start at turn 1 and increment independently — so both Player A and Player B get 2 energy on their first turn, 3 on their second, etc. Energy resets to the scaling formula at the start of each new combat encounter — it does not carry between fights.
- **Turn timer:** Each combat turn has a 30-second time limit. If a player does not end their turn within 30 seconds, the turn auto-ends (no more cards played). This applies to both PvE and PvP.
- **Draw:** 5 cards per turn from your draw pile
- **Card types:** Attack (deal damage), Skill (block/buff/utility), Power (persistent effects)
- **Card costs:** 0–3 energy
- **Block:** Temporary shield that absorbs damage. Resets to 0 at the start of your next turn. In PvP, this means block gained on your turn absorbs damage from the opponent's following turn, then resets before your next turn — same as StS behavior.
- **Discard:** Remaining hand is discarded at end of turn. When the draw pile is empty, shuffle the discard pile into the draw pile.

### PvE Combat (Monster Fights)

1. Player walks onto a monster's tile — combat begins.
2. **Turn sequence:** Draw 5 → gain energy → play cards → end turn → monster acts → repeat.
3. Fight continues until the monster dies or the player dies.
4. **Player death:** If the player reaches 0 HP during a PvE fight, they are eliminated.
5. **Fleeing:** Players may flee a PvE fight at the start of any turn (before playing cards). Fleeing costs 10 HP as a penalty and returns the player to an adjacent tile. The monster event is consumed with no reward. Fleeing is not available on turn 1.
6. Monster behavior follows predefined patterns (attack/defend cycles, buff phases).

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
5. **Round end with no cap reached:** If 4 rounds complete without either player hitting 20 damage, the fight simply ends. There is no winner — both players keep whatever damage they took.
6. **After combat:** Both players return to the overworld at adjacent tiles. Damage persists. There is a 10-second PvP immunity cooldown after a fight — neither player can initiate PvP with the other during this period. They can still fight other players or monsters.
7. **Death:** If a player reaches 0 HP during a PvP fight, they are eliminated.
8. **Simultaneous collision:** If two players walk onto the same tile on the same server tick, the player whose input was processed first is the initiator. If Player C walks onto a tile where a fight is already occurring, they are bounced to an adjacent tile (cannot join or interrupt).
9. **Simultaneous PvE collision:** If two players walk onto a monster tile on the same tick, the first-processed player enters combat. The second player is bounced to an adjacent tile.

## 6. Event Alternation Rule

Players must alternate between fight and non-fight events to prevent pure passive play.

- **Opening phase:** The first 3 non-fight events are free (no restriction).
- **After 3 free events:** The player must complete a fight (monster OR PvP) before using another non-fight event.
- **Locked events:** Non-fight events the player can't use show a lock icon. The player can see them but cannot interact.
- **PvP counts:** Walking into another player and completing a PvP fight satisfies the fight requirement.
- **Random (?) events:** If the ? resolves as a fight, it counts as the required fight. If it resolves as a non-fight, it counts as a non-fight use.

## 7. Events & Random Encounters

### Campfire (Non-Fight)

- **Effect:** Heal 25–30 HP (cannot exceed current max HP).
- **Interaction:** Walk onto tile → healing animation → HP restored.
- Disappears after use.

### Blacksmith (Non-Fight)

- **Effect:** Upgrade 1 card in your deck.
- **Interaction:** Walk onto tile → view your deck → pick a card to upgrade.
- Each card has a predefined upgraded version. Upgrade rules follow a systematic pattern: Attack cards gain ~50% more damage, Skill cards gain ~50% more block/effect, Power cards gain enhanced secondary effects. Some cards also gain a secondary effect on upgrade (e.g., Fireball 8 dmg → Fireball+ 11 dmg + 2 Burn). Individual card upgrade definitions will be detailed in the card data files during implementation.
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
- **Rogue — Black Market:** Gain a random card from another player's class card pool (you get a copy — the other player does not lose a card).

**Gambling Pool (~25% chance):**
- **Cursed Coin Flip:** 50/50 — gain 2 powerful cards OR lose 25 HP.
- **Mysterious Potion:** Random effect — full heal, upgrade all cards, OR add 3 curse cards to deck.
- **Double or Nothing:** Fight a rare monster with 2× HP. Win (kill it) → 2 powerful cards. Flee or die → lose 30 HP (this replaces the standard 10 HP flee cost — the 30 HP penalty includes the cost of fleeing). The flee mechanic from PvE applies.
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

- **Small monster reward:** Pick 1 of 3 cards drawn from the pool of your class's non-starting basic cards (the 6 basic cards not in your starting deck) and low-tier archetype cards.
- **Rare monster reward:** Pick 1 of 3 cards from your class's powerful archetype pool (the stronger cards within each archetype set).
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

- **Top center:** Enemy sprite, HP bar, and intent indicator (PvE only — shows what the monster will do next turn, StS-style). In PvP, the opponent's HP, block, and energy are shown instead (no intent — the opponent hasn't chosen yet).
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

## 12. Solo Practice Mode

When only 1 player starts the game:
- Map generates with 8 events (per the scaling table).
- No zone shrinking — the full map remains available.
- No PvP — the game is purely PvE exploration and deck building.
- The game ends when all events are consumed or the player dies. A score screen shows stats.
- The event alternation rule still applies (3 free non-fights, then must fight between each).

## 13. Disconnection Handling

- **During overworld:** A disconnected player's character stands still for 30 seconds. If they reconnect within 30 seconds, they resume. After 30 seconds, they are eliminated (treated as 0 HP).
- **During combat (PvP):** If a player disconnects mid-PvP, their turns auto-pass (end turn immediately with no cards played) for the remaining rounds. After combat, the disconnected player follows the 30-second overworld rule.
- **During combat (PvE):** The fight pauses for 15 seconds. If the player does not reconnect, they are eliminated.
- **Host disconnect:** If the host disconnects, host authority transfers to the next player in the lobby list. The game continues.
