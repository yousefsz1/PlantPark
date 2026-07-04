export type Level = {
  name: string;
  emoji: string;
  minXP: number;
  maxXP: number;
};

export const LEVELS: Level[] = [
  { name: 'Seedling',        emoji: '🌱', minXP: 0,    maxXP: 99   },
  { name: 'Sprout',          emoji: '🌿', minXP: 100,  maxXP: 299  },
  { name: 'Grower',          emoji: '🪴', minXP: 300,  maxXP: 599  },
  { name: 'Budding Gardener', emoji: '🌷', minXP: 600,  maxXP: 999  },
  { name: 'Green Thumb',     emoji: '🌳', minXP: 1000, maxXP: 1499 },
  { name: 'Bloom Keeper',    emoji: '🌸', minXP: 1500, maxXP: 2099 },
  { name: 'Garden Sage',     emoji: '🧙', minXP: 2100, maxXP: 2799 },
  { name: 'Master Gardener', emoji: '🏆', minXP: 2800, maxXP: Infinity },
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
