export type Level = {
  name: string;
  emoji: string;
  // Ionicons glyph name — used instead of `emoji` for on-screen rendering,
  // since Apple Color Emoji renders incompletely on iOS Simulator.
  icon: string;
  minXP: number;
  maxXP: number;
};

// Rebalanced 18 Jul 2026: the old ladder maxed out at 2,800 XP (~3 months of
// active use). The new curve keeps early levels fast (hook), then roughly
// doubles per tier — the final tier is a multi-year journey. Client-side
// only: existing XP simply re-maps onto the new thresholds.
export const LEVELS: Level[] = [
  { name: 'Seedling',         emoji: '🌱', icon: 'leaf-outline',   minXP: 0,      maxXP: 149    },
  { name: 'Sprout',           emoji: '🌿', icon: 'leaf',           minXP: 150,    maxXP: 399    },
  { name: 'Grower',           emoji: '🪴', icon: 'flower-outline', minXP: 400,    maxXP: 899    },
  { name: 'Budding Gardener', emoji: '🌷', icon: 'flower',         minXP: 900,    maxXP: 1799   },
  { name: 'Green Thumb',      emoji: '🌳', icon: 'rose-outline',   minXP: 1800,   maxXP: 3499   },
  { name: 'Bloom Keeper',     emoji: '🌸', icon: 'rose',           minXP: 3500,   maxXP: 6999   },
  { name: 'Garden Sage',      emoji: '🧙', icon: 'color-wand',     minXP: 7000,   maxXP: 11999  },
  { name: 'Master Gardener',  emoji: '🏆', icon: 'trophy',         minXP: 12000,  maxXP: 19999  },
  { name: 'Botanist',         emoji: '🎖️', icon: 'medal',          minXP: 20000,  maxXP: 29999  },
  { name: 'Plant Legend',     emoji: '💎', icon: 'diamond',        minXP: 30000,  maxXP: 39999  },
  { name: 'Forest Guardian',  emoji: '🛡️', icon: 'shield',         minXP: 40000,  maxXP: 59999  },
  { name: 'Plant Whisperer',  emoji: '✨', icon: 'sparkles',       minXP: 60000,  maxXP: 79999  },
  { name: 'Garden Immortal',  emoji: '♾️', icon: 'infinite',       minXP: 80000,  maxXP: 99999  },
  { name: 'Eden Keeper',      emoji: '🪐', icon: 'planet',         minXP: 100000, maxXP: Infinity },
];

export function getLevel(totalXP: number): Level {
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (totalXP >= LEVELS[i].minXP) return LEVELS[i];
  }
  return LEVELS[0];
}

// The next level up, or null at max — used by the hero XP card to show
// "520 XP to Garden Sage" instead of a generic "to next level".
export function getNextLevel(totalXP: number): Level | null {
  const idx = LEVELS.indexOf(getLevel(totalXP));
  return idx >= LEVELS.length - 1 ? null : LEVELS[idx + 1];
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
