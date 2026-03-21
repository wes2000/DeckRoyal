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
