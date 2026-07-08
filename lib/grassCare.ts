export type SunExposure = 'full_sun' | 'partial_shade' | 'full_shade';
export type LawnCondition = 'healthy' | 'patchy' | 'yellowing' | 'unsure';

const BASE_WATERING_DAYS: Record<SunExposure, number> = {
  full_sun: 2,
  partial_shade: 3,
  full_shade: 4,
};

export function getWateringPlan(
  sunExposure: SunExposure,
  lawnCondition: LawnCondition,
  areaM2: number,
): { intervalDays: number; liters: number } {
  const base = BASE_WATERING_DAYS[sunExposure];
  const needsMoreWater = lawnCondition === 'patchy' || lawnCondition === 'yellowing';
  const intervalDays = needsMoreWater ? Math.max(1, base - 1) : base;
  const liters = Math.round(areaM2 * 2);
  return { intervalDays, liters };
}

export function getFertilizingPlan(areaM2: number): { intervalDays: number; cups: number } {
  const cups = Math.max(0.5, Math.round((areaM2 / 6) * 2) / 2);
  return { intervalDays: 42, cups };
}

export function getMowingPlan(lawnCondition: LawnCondition): { intervalDays: number; note: string | null } {
  const needsCare = lawnCondition === 'patchy' || lawnCondition === 'yellowing';
  return { intervalDays: 7, note: needsCare ? "Keep clippings light while it's recovering" : null };
}

// AI insight — hardcoded template text (not an AI API call), composed from a
// per-condition cause + per-sun-exposure clause. Only relevant for lawns that
// aren't 'healthy'.
const CONDITION_CAUSE: Record<Exclude<LawnCondition, 'healthy'>, Record<SunExposure, string>> = {
  patchy: {
    full_sun: 'Patchy spots in full sun are often caused by heat stress and uneven watering coverage.',
    partial_shade: 'Patchy spots in partial shade are often caused by competition for light and uneven root growth.',
    full_shade: 'Patchy spots in full shade are often caused by grass struggling to get enough light to fill in evenly.',
  },
  yellowing: {
    full_sun: "Yellowing in full sun usually points to the lawn drying out faster than it's being watered.",
    partial_shade: 'Yellowing in partial shade can be a sign of inconsistent watering or early nutrient stress.',
    full_shade: 'Yellowing in full shade is often just reduced light limiting how green the grass can grow.',
  },
  unsure: {
    full_sun: "Since you're not sure what's going on, we've started with a schedule suited to full sun — the most common stress factor for lawns.",
    partial_shade: "Since you're not sure what's going on, we've started with a schedule suited to partial shade as a solid baseline.",
    full_shade: "Since you're not sure what's going on, we've started with a schedule suited to full shade, since low light is the most common cause of a lawn that isn't thriving.",
  },
};

export function getGrassInsight(sunExposure: SunExposure, lawnCondition: LawnCondition): string | null {
  if (lawnCondition === 'healthy') return null;
  const cause = CONDITION_CAUSE[lawnCondition][sunExposure];
  return `${cause} The watering schedule above already accounts for this.`;
}
