export type WateringFrequency = 'daily' | 'weekly' | 'monthly';
export type Sunlight = 'low' | 'medium' | 'bright';

// Water-themed accent for the watering bar — matches the blue already used
// for water-related UI elsewhere (e.g. the watering reminder preview on the
// Display screen), kept fixed across themes like ToxicitySeverityBar's
// severity colors.
export const WATER_COLOR = '#4A90D9';

// Representative day-count used when only the category (not a precise
// interval) is known — e.g. favourites, which have no day-count field at all.
const FALLBACK_WATERING_DAYS: Record<WateringFrequency, number> = {
  daily: 2,
  weekly: 7,
  monthly: 25,
};

// Inverted: more frequent watering (fewer days between waterings) -> higher
// level. Prefers a precise day-count when available (scan/add-plant's live
// `wateringDays`, or a saved plant's `care_tasks.interval_days`); falls back
// to a representative day-count for the category otherwise.
export function getWateringLevel(
  days: number | null | undefined,
  frequency?: WateringFrequency | string | null,
): number {
  const effectiveDays =
    typeof days === 'number' && days > 0
      ? days
      : frequency
        ? (FALLBACK_WATERING_DAYS[frequency as WateringFrequency] ?? null)
        : null;

  if (effectiveDays == null) return 0;
  if (effectiveDays <= 2) return 5;
  if (effectiveDays <= 4) return 4;
  if (effectiveDays <= 9) return 3;
  if (effectiveDays <= 20) return 2;
  return 1;
}

const SUNLIGHT_LEVELS: Record<Sunlight, number> = {
  low: 1,
  medium: 3,
  bright: 5,
};

export function getSunlightLevel(sunlight: Sunlight | string | null | undefined): number {
  if (!sunlight) return 0;
  return SUNLIGHT_LEVELS[sunlight as Sunlight] ?? 0;
}
