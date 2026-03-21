import type { Position, ZoneBoundary, EventTile } from '@shared/types';
import {
  ZONE_PHASES,
  ZONE_DAMAGE_PER_SECOND,
  SUDDEN_DEATH_DAMAGE_PER_SECOND,
  ZONE_WARNING_SECONDS,
} from '@shared/constants';

/**
 * Returns the highest phase index whose timeSeconds <= elapsedSeconds.
 */
export function getZonePhase(elapsedSeconds: number): number {
  let phase = 0;
  for (const zp of ZONE_PHASES) {
    if (elapsedSeconds >= zp.timeSeconds) {
      phase = zp.phase;
    }
  }
  return phase;
}

/**
 * Calculates a centered rectangle covering zonePercent% of the map area.
 * Side length = sqrt(zonePercent / 100) * mapDimension, centered on the map.
 * Boundary values are integers (floor for min edges, ceil-1 for max edges).
 */
export function getZoneBoundary(mapWidth: number, mapHeight: number, phase: number): ZoneBoundary {
  // Default to full map for invalid phase
  const zp = ZONE_PHASES.find(z => z.phase === phase);
  const zonePercent = zp ? zp.zonePercent : 100;

  const factor = Math.sqrt(zonePercent / 100);
  const zoneWidth = factor * mapWidth;
  const zoneHeight = factor * mapHeight;

  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;

  const minX = Math.floor(centerX - zoneWidth / 2);
  const minY = Math.floor(centerY - zoneHeight / 2);
  const maxX = Math.ceil(centerX + zoneWidth / 2) - 1;
  const maxY = Math.ceil(centerY + zoneHeight / 2) - 1;

  return {
    minX: Math.max(0, minX),
    minY: Math.max(0, minY),
    maxX: Math.min(mapWidth - 1, maxX),
    maxY: Math.min(mapHeight - 1, maxY),
  };
}

/**
 * Returns true if position is inside zone boundary (inclusive).
 */
export function isInsideZone(position: Position, boundary: ZoneBoundary): boolean {
  return (
    position.x >= boundary.minX &&
    position.x <= boundary.maxX &&
    position.y >= boundary.minY &&
    position.y <= boundary.maxY
  );
}

/**
 * Returns zone damage per second:
 * - Sudden death (phase 5): SUDDEN_DEATH_DAMAGE_PER_SECOND everywhere
 *   (isInZone is ignored — all players take damage during sudden death)
 * - Inside zone: 0
 * - Outside zone: ZONE_DAMAGE_PER_SECOND
 */
export function getZoneDamage(elapsedSeconds: number, isInZone: boolean): number {
  const phase = getZonePhase(elapsedSeconds);
  const zp = ZONE_PHASES.find(z => z.phase === phase);

  if (zp?.suddenDeath) {
    return SUDDEN_DEATH_DAMAGE_PER_SECOND;
  }

  return isInZone ? 0 : ZONE_DAMAGE_PER_SECOND;
}

/**
 * Returns a new array with events outside the zone marked active=false.
 * Does not mutate the original array or event objects.
 */
export function destroyEventsOutsideZone(events: EventTile[], boundary: ZoneBoundary): EventTile[] {
  return events.map(event => {
    if (!isInsideZone(event.position, boundary)) {
      return { ...event, active: false };
    }
    return event;
  });
}

/**
 * Returns the closest in-zone position by clamping to boundary edges.
 * Returns the same position if already inside.
 */
export function getNearestSafePosition(position: Position, boundary: ZoneBoundary): Position {
  return {
    x: Math.max(boundary.minX, Math.min(boundary.maxX, position.x)),
    y: Math.max(boundary.minY, Math.min(boundary.maxY, position.y)),
  };
}

/**
 * Returns true if within ZONE_WARNING_SECONDS of the next phase transition.
 */
export function isZoneWarning(elapsedSeconds: number): boolean {
  for (const zp of ZONE_PHASES) {
    if (zp.timeSeconds > elapsedSeconds) {
      // This is an upcoming transition
      return zp.timeSeconds - elapsedSeconds <= ZONE_WARNING_SECONDS;
    }
  }

  return false;
}
