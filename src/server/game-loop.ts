import type { GameState } from '@shared/types';
import {
  getZonePhase,
  getZoneBoundary,
  isInsideZone,
  getZoneDamage,
  destroyEventsOutsideZone,
  isZoneWarning,
} from '@engine/zone';
import { ZONE_PHASES } from '@shared/constants';
import { checkWinCondition, eliminatePlayer } from './game-manager';
import { checkTurnTimer } from './combat-handler';

// ─── Types ────────────────────────────────────────────────────────────────────

export type GameEvent =
  | { type: 'zonePhaseChanged'; phase: number }
  | { type: 'zoneWarning'; nextPhase: number; timeUntil: number }
  | { type: 'playerDamaged'; playerId: string; damage: number; source: 'zone' | 'sudden_death' }
  | { type: 'playerEliminated'; playerId: string }
  | { type: 'eventDestroyed'; eventId: string }
  | { type: 'turnAutoEnded'; combatId: string; playerId: string }
  | { type: 'gameOver'; winnerId: string };

export interface TickResult {
  game: GameState;
  events: GameEvent[];
}

// ─── tick ─────────────────────────────────────────────────────────────────────

/**
 * Advances the game by deltaTime seconds.
 *
 * Steps per tick:
 * 1. Advance elapsed time
 * 2. Check zone phase transitions (skip in solo mode)
 * 3. Apply zone/sudden-death damage to alive players
 * 4. Destroy events outside zone
 * 5. Check turn timers for active combats
 * 6. Check win condition
 */
export function tick(game: GameState, deltaTime: number, currentTime: number): TickResult {
  const emittedEvents: GameEvent[] = [];
  let current = game;

  // ── 1. Advance elapsed time ──────────────────────────────────────────────
  current = { ...current, elapsed: current.elapsed + deltaTime };

  const isSoloMode = Object.keys(current.players).length === 1;

  // ── 2. Zone phase transitions (skipped in solo mode) ─────────────────────
  if (!isSoloMode) {
    const newPhase = getZonePhase(current.elapsed);

    if (newPhase !== current.zonePhase) {
      const newBoundary = getZoneBoundary(current.map.width, current.map.height, newPhase);
      current = { ...current, zonePhase: newPhase, zoneBoundary: newBoundary };
      emittedEvents.push({ type: 'zonePhaseChanged', phase: newPhase });
    }

    // Zone warning: emit if within 30s of the next phase transition
    if (isZoneWarning(current.elapsed)) {
      // Find the next upcoming phase
      const nextZonePhase = ZONE_PHASES.find(zp => zp.timeSeconds > current.elapsed);
      if (nextZonePhase) {
        emittedEvents.push({
          type: 'zoneWarning',
          nextPhase: nextZonePhase.phase,
          timeUntil: nextZonePhase.timeSeconds - current.elapsed,
        });
      }
    }
  }

  // ── 3. Zone damage ────────────────────────────────────────────────────────
  for (const player of Object.values(current.players)) {
    if (!player.isAlive) continue;

    const inZone = isInsideZone(player.position, current.zoneBoundary);
    const damagePerSecond = getZoneDamage(current.elapsed, inZone);

    if (damagePerSecond <= 0) continue;

    const damageThisTick = damagePerSecond * deltaTime;
    const newHp = player.hp - damageThisTick;

    // Determine damage source
    const currentPhase = getZonePhase(current.elapsed);
    const zp = ZONE_PHASES.find(z => z.phase === currentPhase);
    const source: 'zone' | 'sudden_death' = zp?.suddenDeath ? 'sudden_death' : 'zone';

    // Apply HP change
    current = {
      ...current,
      players: {
        ...current.players,
        [player.id]: { ...player, hp: newHp },
      },
    };

    emittedEvents.push({ type: 'playerDamaged', playerId: player.id, damage: damageThisTick, source });

    // Eliminate player if HP dropped to 0 or below
    if (newHp <= 0) {
      current = eliminatePlayer(current, player.id);
      emittedEvents.push({ type: 'playerEliminated', playerId: player.id });
    }
  }

  // ── 4. Destroy events outside zone ───────────────────────────────────────
  const prevEvents = current.events;
  const updatedEvents = destroyEventsOutsideZone(prevEvents, current.zoneBoundary);

  for (let i = 0; i < prevEvents.length; i++) {
    const before = prevEvents[i];
    const after = updatedEvents[i];
    // Only emit destruction for events that were active before and are now inactive
    if (before.active && !after.active) {
      emittedEvents.push({ type: 'eventDestroyed', eventId: before.id });
    }
  }

  current = { ...current, events: updatedEvents };

  // ── 5. Check turn timers for active combats ───────────────────────────────
  for (const combat of Object.values(current.combats)) {
    if (combat.isComplete) continue;
    if (currentTime < combat.turnTimer) continue;

    // Timer expired — auto-end the active player's turn
    const activePlayerId = combat.playerIds[combat.activePlayerIndex];
    if (!activePlayerId) continue;

    emittedEvents.push({ type: 'turnAutoEnded', combatId: combat.id, playerId: activePlayerId });

    // Delegate the actual turn-end logic to combat-handler
    current = checkTurnTimer(current, combat.id, currentTime);
  }

  // ── 6. Win condition ──────────────────────────────────────────────────────
  const winnerId = checkWinCondition(current);
  if (winnerId !== null) {
    emittedEvents.push({ type: 'gameOver', winnerId });
  }

  return { game: current, events: emittedEvents };
}
