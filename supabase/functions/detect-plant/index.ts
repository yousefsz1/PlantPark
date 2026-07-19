import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { checkScanAllowance, recordScans } from '../_shared/scanGuard.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model to use — update if Google releases a newer flash variant
const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are an expert botanist and plant care specialist. Identify the plant in the photo, assess its visible health, and return EXACTLY this JSON (no markdown, no code fences, raw JSON only):

{
  "name": "Common name of the plant",
  "species": "Genus species (botanical name)",
  "isGrass": <boolean — true ONLY if this is turf/lawn grass (grown as a mowed ground-cover lawn, e.g. Bermuda, Kentucky bluegrass, fescue, ryegrass, zoysia), false for everything else including ornamental/architectural grasses (pampas grass, fountain grass, liriope, mondo grass, zebra grass) and any potted/individual specimen>,
  "wateringFrequency": "daily" | "weekly" | "monthly",
  "wateringDays": <number — watering interval in days>,
  "sunlight": "low" | "medium" | "bright",
  "soilType": "Brief soil description, max 50 chars",
  "temperature": "Ideal range e.g. 65-80°F / 18-27°C",
  "maxHeight": "<string — typical maximum height for this species at maturity, e.g. '60-100 cm' or '2-3 meters'. Use your best botanical judgement for a realistic typical range.>",
  "floweringSeason": "<string — typical flowering season/months, e.g. 'Spring (March-May)'. Return exactly the string \"N/A\" if this plant doesn't flower or flowering isn't a relevant/observable trait for it (e.g. most foliage houseplants).>",
  "fruitingSeason": "<string — typical fruiting season/months, e.g. 'Summer (June-August)'. Return exactly the string \"N/A\" if this plant doesn't produce fruit — this applies to most houseplants and foliage plants.>",
  "growingLocation": "indoor" | "outdoor" | "both",
  "careTip": "One actionable tip specific to this plant, max 100 chars",
  "fertilizingDays": <number — fertilizing interval in days>,
  "mistingDays": <number or null — misting interval in days, null if not needed>,
  "toxicToHumans": <boolean — true if the plant is toxic/poisonous if ingested by humans>,
  "toxicToPets": <boolean — true if toxic/poisonous to cats or dogs if ingested>,
  "humanSeverity": <integer 0-5 — severity of toxicity to humans: 0 = non-toxic, 1 = mild irritation, 2-3 = moderate GI/systemic symptoms, 4 = severe symptoms requiring medical attention, 5 = potentially fatal>,
  "petSeverity": <integer 0-5 — severity of toxicity to cats/dogs, same scale: 0 = non-toxic, 1 = mild irritation, 2-3 = moderate GI/systemic symptoms, 4 = severe symptoms requiring vet attention, 5 = potentially fatal>,
  "toxicityNote": <string or null — ONE short, simple sentence, max 100 chars, with an important safety note (e.g. symptoms, severity) if genuinely relevant. Null if non-toxic to both with nothing notable to add.>,
  "isHealthy": <boolean — true if plant looks healthy, false if visible problems detected>,
  "healthScore": <integer 0-100 — your honest assessment of the plant's current visible health:
    95-100 = perfect health, vibrant colour, no issues;
    75-94 = mostly healthy, very minor cosmetic issues (tiny spots, one slightly yellow leaf);
    50-74 = clearly visible stress — yellowing leaves, leaf curl, minor pests, wilting tips;
    25-49 = significant problems affecting several leaves or growth points;
    0-24 = severe decline, widespread damage, or near-dead.
    Must be consistent: isHealthy true → healthScore ≥ 70; isHealthy false → healthScore < 70>,
  "healthIssues": [<string> — list visible problems e.g. "Yellow leaves", "Brown leaf tips", "Signs of pests", "Wilting stems". Empty array [] if healthy.],
  "home_tips": [<string> — exactly 2-3 simple, everyday household remedies or prevention tips written for a total beginner, max 110 chars each, plain non-technical language (avoid jargon like "pH", "N-P-K", "nitrogen ratio"). Prefix each with ONE emoji from this fixed, well-supported set only: ☕ (coffee grounds) 🥛 (milk) 🥚 (eggshells) 🍌 (banana peel) 🧴 (spray/liquid application) 🌿 (cinnamon/general plant remedy) 💧 (water/misting) 🌞 (light/sunlight) 🪴 (general potting/soil tip). Never use any emoji outside this set. Omit the emoji prefix only if none of these fit (e.g. "Rotate pot weekly for even light exposure").],
  "pro_tips": [<string> — exactly 1-2 more technical, horticultural remedies for an experienced grower, max 150 chars each, e.g. soil pH adjustment, drainage fixes, specific fertilizer N-P-K ratios. Plain text, no emoji prefix.],
  "healthStatus": "healthy" | "needs_attention" | "critical",
  "healthDiagnosisIssues": <string or null — ONE or TWO plain-language sentences describing visible signs of ill health you can see in THIS photo: discoloration, spots, wilting, pest damage, leaf drop, necrosis, etc, e.g. "Yellowing on lower leaves, some leaf drop." Null if healthStatus is "healthy".>,
  "healthRecommendation": <string or null — ONE actionable suggested next step addressing the specific issue observed, e.g. "Reduce watering frequency and check for root rot." Null if healthStatus is "healthy".>
}

Rules:
- isGrass must be true ONLY for turf/lawn grass — a dense, uniform, mowed ground-cover lawn covering the ground, not an individual potted or clumping specimen. Return false for ornamental/architectural grasses grown as accent plants (pampas grass, fountain grass, liriope, mondo grass, zebra grass), for anything in a pot/container, and for all non-grass plants. When genuinely uncertain whether a grass-like photo shows lawn turf vs. an ornamental specimen, default to false.
- wateringFrequency: "daily" = every 1-3 days, "weekly" = every 4-14 days, "monthly" = 15+ days
- wateringDays must match wateringFrequency (e.g. "weekly" with 7 days is valid)
- sunlight: "low" = shade-tolerant, "medium" = indirect light, "bright" = direct/strong indirect
- maxHeight must always be an actual value — never "N/A" or null — since every plant has some typical mature size; give your best estimate even if the species is uncommon
- floweringSeason must be "N/A" (exact string, not null) whenever the plant does not flower or flowering is not a normally observable/relevant trait for it — do not invent a season for non-flowering foliage plants. Only give an actual season/month range when the plant genuinely, typically flowers.
- fruitingSeason must be "N/A" (exact string, not null) for the large majority of houseplants and foliage plants that don't produce fruit — only give an actual season/month range for plants that genuinely, typically fruit (e.g. citrus, tomato, strawberry)
- growingLocation must be exactly one of "indoor", "outdoor", or "both" — "indoor" for plants typically kept as houseplants, "outdoor" for plants that need outdoor garden/patio conditions to thrive, "both" for plants commonly grown successfully in either setting
- healthScore must reflect what you actually see in the photo — do not default to 100 if there are visible issues
- If isHealthy is true: healthIssues must be [] and home_tips should be 2-3 general beginner-friendly prevention tips, pro_tips should be 1-2 general advanced-care tips
- If isHealthy is false: healthIssues lists 1-3 visible problems; home_tips must address the visible issues with beginner-friendly fixes; pro_tips may offer more advanced, technical fixes for the same issues
- home_tips must always have exactly 2-3 entries — never fewer, never more
- pro_tips must always have exactly 1-2 entries — never fewer, never more
- Prefer safe, verified household remedies in home_tips where appropriate, such as: diluted coffee grounds (nitrogen boost, acid-loving plants), baking soda + water spray (mild fungicide for leaf spot/powdery mildew, ~1 tsp per quart), cinnamon (natural antifungal for cuttings/soil), crushed eggshells (calcium boost, pest deterrent), diluted milk spray (1:10 ratio, mild fungicide for some leaf issues), banana peel steeped in water (potassium boost, steep 2-3 days)
- NEVER suggest salt, vinegar, bleach, or any remedy harmful to plants or soil in either home_tips or pro_tips — always favor safe, plant-friendly ingredients and treatments
- Both home_tips and pro_tips must be specific and actionable: include exact ratios, amounts, or frequency (e.g. "weekly", "1:10 ratio", "1 tsp per quart") — avoid vague advice like "apply occasionally". This is where pro_tips should give exact pH targets or fertilizer N-P-K ratios, not just general concepts.
- Do not exceed the max character length for each field — keep every entry concise enough to fit the limit
- Emoji prefixes in home_tips must come ONLY from the approved set listed above (☕ 🥛 🥚 🍌 🧴 🌿 💧 🌞 🪴) — never use any other emoji, even if it seems relevant, to avoid rendering issues on some devices
- pro_tips must never include an emoji prefix — plain technical text only
- healthStatus is a SEPARATE, independent visual diagnosis from healthScore/isHealthy above — be conservative: "critical" is reserved ONLY for genuinely severe, obvious visual distress (e.g. widespread necrosis, the plant appears to be dying, severe pest infestation, extensive wilting across most of the plant) — never for minor cosmetic imperfections. Use "needs_attention" for real but moderate issues (some yellowing, minor pest signs, a few wilting leaves) worth the owner's attention. Use "healthy" when the plant shows no significant visual problems. healthStatus should broadly agree with healthScore/isHealthy (e.g. don't return "critical" alongside a healthScore above 40), but is graded on its own 3-tier scale, not derived by formula from healthScore.
- healthDiagnosisIssues and healthRecommendation must both be null when healthStatus is "healthy" — never invent an issue or recommendation for a healthy-looking plant
- Use real, well-established toxicity knowledge for common houseplants/garden plants (e.g. lilies toxic to cats, pothos toxic to both humans and pets, basil safe for both) — be accurate, not speculative
- If you are not confident about a plant's toxicity, default toxicToHumans and toxicToPets to true (safer default) rather than guessing false
- humanSeverity and petSeverity must be consistent with toxicToHumans/toxicToPets: if toxicToHumans is false, humanSeverity must be 0; if true, humanSeverity must be 1-5 matching the actual severity. Same rule for toxicToPets/petSeverity.
- toxicityNote should only be non-null when there's a genuinely useful safety detail to add (e.g. "Causes vomiting and oral irritation if chewed by cats or dogs") — leave null for plants with no notable concern
- Always return all fields. If unsure, make a best guess. Return ONLY JSON.`;

async function fetchGeminiWithRetry(url: string, body: string, maxRetries = 2): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (res.status !== 503 || attempt === maxRetries) return res;
    await res.text().catch(() => {}); // drain the overloaded response before retrying
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw new Error('Unreachable');
}

const TOXICITY_SYSTEM_PROMPT = `You are a toxicology expert for plants. Given a plant's common name and species, independently assess its toxicity. Return EXACTLY this JSON (no markdown, no code fences, raw JSON only):

{
  "toxicToHumans": <boolean — true if the plant is toxic/poisonous if ingested by humans>,
  "toxicToPets": <boolean — true if toxic/poisonous to cats or dogs if ingested>,
  "humanSeverity": <integer 0-5 — severity of toxicity to humans: 0 = non-toxic, 1 = mild irritation, 2-3 = moderate GI/systemic symptoms, 4 = severe symptoms requiring medical attention, 5 = potentially fatal>,
  "petSeverity": <integer 0-5 — severity of toxicity to cats/dogs, same scale: 0 = non-toxic, 1 = mild irritation, 2-3 = moderate GI/systemic symptoms, 4 = severe symptoms requiring vet attention, 5 = potentially fatal>,
  "toxicityNote": <string or null — ONE short, simple sentence, max 100 chars, with an important safety note (e.g. symptoms, severity) if genuinely relevant. Null if non-toxic to both with nothing notable to add.>
}

Rules:
- Use real, well-established toxicity knowledge for common houseplants/garden plants — be accurate, not speculative
- If you are not confident about a plant's toxicity, default toxicToHumans and toxicToPets to true (safer default) rather than guessing false
- humanSeverity and petSeverity must be consistent with toxicToHumans/toxicToPets: if false, severity must be 0; if true, severity must be 1-5 matching the actual severity
- toxicityNote should only be non-null when there's a genuinely useful safety detail to add
- Return ONLY JSON.`;

type ToxicityCheck = {
  toxicToHumans: boolean;
  toxicToPets: boolean;
  humanSeverity: number;
  petSeverity: number;
  toxicityNote: string | null;
};

// Independent second opinion on toxicity via Claude Haiku — text-only (name/species),
// runs after Gemini since it needs Gemini's identification as input. Never throws:
// any failure (missing key, network error, timeout, bad JSON) resolves to null so the
// scan always succeeds using Gemini's own toxicity fields as a fallback.
async function fetchClaudeToxicityCheck(name: string, species: string): Promise<ToxicityCheck | null> {
  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return null;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        system: TOXICITY_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: `Plant name: ${name}\nSpecies: ${species}\n\nAssess its toxicity.`,
        }],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return null;

    const result = await res.json();
    const raw = result.content?.[0]?.text ?? '';
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    if (typeof parsed.toxicToHumans !== 'boolean' || typeof parsed.toxicToPets !== 'boolean') return null;
    const isValidSeverity = (n: unknown): n is number =>
      typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 5;
    if (!isValidSeverity(parsed.humanSeverity) || !isValidSeverity(parsed.petSeverity)) return null;

    return {
      toxicToHumans: parsed.toxicToHumans,
      toxicToPets: parsed.toxicToPets,
      humanSeverity: parsed.humanSeverity,
      petSeverity: parsed.petSeverity,
      toxicityNote: typeof parsed.toxicityNote === 'string' ? parsed.toxicityNote : null,
    };
  } catch {
    return null;
  }
}

type ToxicityOverride = {
  toxicToHumans: boolean;
  toxicToPets: boolean;
  humanSeverity: number;
  petSeverity: number;
  toxicityNote: string | null;
};

// Hardcoded, verified ASPCA/veterinary toxicity data for well-known plants — takes
// priority over both Gemini and Claude's assessments.
//
// Matching is genus-first: Gemini's `species` field ("Genus species") is far more
// standardized across calls than its free-text common `name`, which can be phrased
// inconsistently between scans of the same plant (e.g. "Orange Tree" vs "Sweet
// Orange" vs "Orange"). Genus lowercased and compared exactly against the first
// word of `species`. The `keywords` list is a secondary fallback for when species
// is missing/vague, checked as a case-insensitive substring of "name species".
// Keywords still favor distinctive genus Latin names/compound phrases over bare
// common words, since bare words like "lemon" or "mint" can appear as decorative
// cultivar epithets on unrelated plants (e.g. Philodendron 'Lemon Lime').
const TOXICITY_OVERRIDES: { genus: string[]; keywords: string[]; data: ToxicityOverride }[] = [
  {
    genus: ['citrus'],
    keywords: ['citrus', 'orange tree', 'lemon tree', 'lime tree', 'meyer lemon', 'key lime'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      humanSeverity: 0,
      petSeverity: 2,
      toxicityNote: 'Essential oils and psoralens in leaves, peel, and stems are toxic to cats and dogs; fruit flesh is safe for humans.',
    },
  },
  {
    genus: ['lilium', 'hemerocallis'],
    keywords: ['lilium', 'hemerocallis', 'daylily', 'day lily', 'tiger lily', 'easter lily', 'asiatic lily', 'oriental lily', 'stargazer lily', 'true lily'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      humanSeverity: 1,
      petSeverity: 5,
      toxicityNote: 'Extremely toxic to cats specifically — even pollen or vase water can cause fatal kidney failure.',
    },
  },
  {
    genus: ['epipremnum', 'scindapsus'],
    keywords: ['pothos', 'epipremnum', "devil's ivy", 'devils ivy', 'scindapsus'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      humanSeverity: 1,
      petSeverity: 2,
      toxicityNote: 'Calcium oxalate crystals cause oral burning and swelling in both humans and pets if chewed.',
    },
  },
  {
    genus: ['aloe'],
    keywords: ['aloe vera', 'aloe barbadensis'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      humanSeverity: 1,
      petSeverity: 2,
      toxicityNote: 'Saponins and anthraquinones cause vomiting/diarrhea in pets; mild GI irritation in humans if ingested.',
    },
  },
  {
    genus: ['crassula'],
    keywords: ['crassula', 'jade plant'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      humanSeverity: 0,
      petSeverity: 2,
      toxicityNote: 'Mildly toxic to cats and dogs — can cause vomiting, incoordination, or lethargy if chewed.',
    },
  },
  {
    genus: ['sansevieria'],
    keywords: ['sansevieria', 'snake plant', 'dracaena trifasciata', "mother-in-law's tongue", 'mother in law’s tongue'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      humanSeverity: 0,
      petSeverity: 1,
      toxicityNote: 'Mildly toxic to pets — saponins can cause drooling, vomiting, or diarrhea if chewed.',
    },
  },
  {
    genus: ['spathiphyllum'],
    keywords: ['peace lily', 'spathiphyllum'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      humanSeverity: 1,
      petSeverity: 2,
      toxicityNote: 'Calcium oxalate crystals cause oral burning, swelling, and drooling in humans and pets.',
    },
  },
  {
    genus: ['ocimum'],
    keywords: ['basil', 'ocimum'],
    data: { toxicToHumans: false, toxicToPets: false, humanSeverity: 0, petSeverity: 0, toxicityNote: null },
  },
  {
    genus: ['rosmarinus'],
    keywords: ['rosemary', 'rosmarinus', 'salvia rosmarinus'],
    data: { toxicToHumans: false, toxicToPets: false, humanSeverity: 0, petSeverity: 0, toxicityNote: null },
  },
  {
    genus: ['mentha'],
    keywords: ['mentha', 'peppermint', 'spearmint'],
    data: { toxicToHumans: false, toxicToPets: false, humanSeverity: 0, petSeverity: 1, toxicityNote: null },
  },
  {
    genus: ['thymus'],
    keywords: ['thymus', 'thyme'],
    data: { toxicToHumans: false, toxicToPets: false, humanSeverity: 0, petSeverity: 0, toxicityNote: null },
  },
  {
    genus: ['echeveria'],
    keywords: ['echeveria'],
    data: { toxicToHumans: false, toxicToPets: false, humanSeverity: 0, petSeverity: 0, toxicityNote: null },
  },
  {
    genus: ['chlorophytum'],
    keywords: ['spider plant', 'chlorophytum comosum', 'chlorophytum'],
    data: {
      toxicToHumans: false,
      toxicToPets: false,
      humanSeverity: 0,
      petSeverity: 1,
      toxicityNote: 'Contains mild compounds that can cause temporary "catnip-like" euphoria in cats, but is not dangerous.',
    },
  },
];

function extractGenus(species: string): string {
  return species.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

function findToxicityOverride(name: string, species: string): ToxicityOverride | null {
  // Primary: genus match — species names are standardized, unlike common names.
  const genus = extractGenus(species);
  if (genus) {
    for (const entry of TOXICITY_OVERRIDES) {
      if (entry.genus.includes(genus)) {
        console.log(`[toxicity-override] genus match: "${genus}" (species="${species}")`);
        return entry.data;
      }
    }
  }

  // Secondary: fallback keyword substring match against "name species".
  const haystack = `${name} ${species}`.toLowerCase();
  for (const entry of TOXICITY_OVERRIDES) {
    const matchedKeyword = entry.keywords.find(kw => haystack.includes(kw));
    if (matchedKeyword) {
      console.log(`[toxicity-override] keyword fallback match: "${matchedKeyword}" (name="${name}", species="${species}")`);
      return entry.data;
    }
  }

  // Neither matched — log for periodic review, to spot common plants worth adding.
  console.log(`[toxicity-override] no match — name="${name}", species="${species}"`);
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Server-side scan-limit enforcement — the client-side check is only a
  // courtesy UI; this is the real gate (prevents direct-API abuse).
  const guard = await checkScanAllowance(req, 1, CORS);
  if (!guard.ok) return guard.response;

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const { image, mediaType } = await req.json();
    if (!image || !mediaType) throw new Error('Missing image or mediaType');

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const type = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetchGeminiWithRetry(url, JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [
            { inline_data: { mime_type: type, data: image } },
            { text: 'Identify this plant and return its care requirements as JSON.' },
          ],
        },
      ],
      generation_config: {
        response_mime_type: 'application/json',
        max_output_tokens: 2048,
        // Disable thinking — not needed for structured JSON output and
        // was consuming most of the token budget before the response began.
        thinking_config: { thinking_budget: 0 },
      },
    }));

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      throw new Error(`Gemini API error: ${err}`);
    }

    const result = await geminiRes.json();
    const candidate = result.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') {
      throw new Error('Gemini response truncated (MAX_TOKENS) — increase max_output_tokens');
    }
    const raw = candidate?.content?.parts?.[0]?.text ?? '';

    // Strip any accidental markdown fences
    const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Meter the scan server-side now that the (paid) Gemini call succeeded.
    // Replaces the old client-side fire-and-forget increment.
    await recordScans(guard.admin, guard.userId, 1);

    // Expose the grass/lawn detection field under the snake_case name the
    // client expects, matching the convention below.
    parsed.is_grass = parsed.isGrass;
    delete parsed.isGrass;

    // Independent toxicity double-check via Claude Haiku — never fails the scan.
    const claudeToxicity = await fetchClaudeToxicityCheck(parsed.name, parsed.species);
    if (claudeToxicity) {
      parsed.toxicToHumans = parsed.toxicToHumans || claudeToxicity.toxicToHumans;
      parsed.toxicToPets   = parsed.toxicToPets   || claudeToxicity.toxicToPets;
      // Severity is a 0-5 number, not a boolean — take the higher (more cautious) of the two.
      parsed.humanSeverity = Math.max(parsed.humanSeverity ?? 0, claudeToxicity.humanSeverity);
      parsed.petSeverity   = Math.max(parsed.petSeverity ?? 0, claudeToxicity.petSeverity);
      if (parsed.toxicityNote && claudeToxicity.toxicityNote && parsed.toxicityNote !== claudeToxicity.toxicityNote) {
        parsed.toxicityNote = `${parsed.toxicityNote} ${claudeToxicity.toxicityNote}`;
      } else {
        parsed.toxicityNote = parsed.toxicityNote ?? claudeToxicity.toxicityNote;
      }
    }

    // Hardcoded verified data overrides both AI assessments for well-known plants.
    const toxicityOverride = findToxicityOverride(parsed.name ?? '', parsed.species ?? '');
    if (toxicityOverride) {
      parsed.toxicToHumans = toxicityOverride.toxicToHumans;
      parsed.toxicToPets   = toxicityOverride.toxicToPets;
      parsed.humanSeverity = toxicityOverride.humanSeverity;
      parsed.petSeverity   = toxicityOverride.petSeverity;
      parsed.toxicityNote  = toxicityOverride.toxicityNote;
    }

    // Expose severity under the snake_case field names the client expects.
    parsed.human_toxicity_severity = parsed.humanSeverity;
    parsed.pet_toxicity_severity   = parsed.petSeverity;
    delete parsed.humanSeverity;
    delete parsed.petSeverity;

    // Expose the new plant-characteristic fields under the snake_case field
    // names the client expects, matching the convention above.
    parsed.max_height       = parsed.maxHeight;
    parsed.flowering_season = parsed.floweringSeason;
    parsed.fruiting_season  = parsed.fruitingSeason;
    parsed.growing_location = parsed.growingLocation;
    delete parsed.maxHeight;
    delete parsed.floweringSeason;
    delete parsed.fruitingSeason;
    delete parsed.growingLocation;

    // Expose the new AI visual health diagnosis fields under the snake_case
    // names matching the health_status/health_diagnosis_issues/
    // health_recommendation DB columns — a separate, independently
    // re-checkable system from healthScore/isHealthy/healthIssues above.
    parsed.health_status            = parsed.healthStatus;
    parsed.health_diagnosis_issues  = parsed.healthDiagnosisIssues ?? null;
    parsed.health_recommendation    = parsed.healthRecommendation ?? null;
    delete parsed.healthStatus;
    delete parsed.healthDiagnosisIssues;
    delete parsed.healthRecommendation;

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});

// ── Claude backup (restore by replacing the serve() block above) ────────────
//
// import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
// const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
// const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
//   method: 'POST',
//   headers: {
//     'x-api-key': apiKey,
//     'anthropic-version': '2023-06-01',
//     'content-type': 'application/json',
//   },
//   body: JSON.stringify({
//     model: 'claude-sonnet-4-6',
//     max_tokens: 900,
//     system: SYSTEM_PROMPT,
//     messages: [{
//       role: 'user',
//       content: [
//         { type: 'image', source: { type: 'base64', media_type: type, data: image } },
//         { type: 'text', text: 'Identify this plant and return its care requirements as JSON.' },
//       ],
//     }],
//   }),
// });
// const result = await anthropicRes.json();
// const raw = result.content?.[0]?.text ?? '';
