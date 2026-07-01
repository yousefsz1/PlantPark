export type Level = {
  name: string;
  emoji: string;
  minXP: number;
  maxXP: number;
};

export const LEVELS: Level[] = [
  { name: 'Seedling',        emoji: '🌱', minXP: 0,   maxXP: 100  },
  { name: 'Sprout',          emoji: '🌿', minXP: 101, maxXP: 300  },
  { name: 'Gardener',        emoji: '🌳', minXP: 301, maxXP: 700  },
  { name: 'Master Gardener', emoji: '🏆', minXP: 701, maxXP: Infinity },
];

export function getLevel(totalXP: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].minXP) return LEVELS[i];
  }
  return LEVELS[0];
}

export function xpToNextLevel(totalXP: number): { current: number; needed: number; pct: number } {
  const level = getLevel(totalXP);
  const idx = LEVELS.indexOf(level);
  if (idx === LEVELS.length - 1) {
    return { current: totalXP - level.minXP, needed: 0, pct: 100 };
  }
  const next = LEVELS[idx + 1];
  const rangeSize = next.minXP - level.minXP;
  const progress  = totalXP - level.minXP;
  return {
    current: progress,
    needed:  rangeSize - progress,
    pct:     Math.min(Math.round((progress / rangeSize) * 100), 100),
  };
}
