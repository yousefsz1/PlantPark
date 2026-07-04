import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

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
  "wateringFrequency": "daily" | "weekly" | "monthly",
  "wateringDays": <number — watering interval in days>,
  "sunlight": "low" | "medium" | "bright",
  "soilType": "Brief soil description, max 50 chars",
  "temperature": "Ideal range e.g. 65-80°F / 18-27°C",
  "careTip": "One actionable tip specific to this plant, max 100 chars",
  "fertilizingDays": <number — fertilizing interval in days>,
  "mistingDays": <number or null — misting interval in days, null if not needed>,
  "toxicToHumans": <boolean — true if the plant is toxic/poisonous if ingested by humans>,
  "toxicToPets": <boolean — true if toxic/poisonous to cats or dogs if ingested>,
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
  "pro_tips": [<string> — exactly 1-2 more technical, horticultural remedies for an experienced grower, max 150 chars each, e.g. soil pH adjustment, drainage fixes, specific fertilizer N-P-K ratios. Plain text, no emoji prefix.]
}

Rules:
- wateringFrequency: "daily" = every 1-3 days, "weekly" = every 4-14 days, "monthly" = 15+ days
- wateringDays must match wateringFrequency (e.g. "weekly" with 7 days is valid)
- sunlight: "low" = shade-tolerant, "medium" = indirect light, "bright" = direct/strong indirect
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
- Use real, well-established toxicity knowledge for common houseplants/garden plants (e.g. lilies toxic to cats, pothos toxic to both humans and pets, basil safe for both) — be accurate, not speculative
- If you are not confident about a plant's toxicity, default toxicToHumans and toxicToPets to true (safer default) rather than guessing false
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
  "toxicityNote": <string or null — ONE short, simple sentence, max 100 chars, with an important safety note (e.g. symptoms, severity) if genuinely relevant. Null if non-toxic to both with nothing notable to add.>
}

Rules:
- Use real, well-established toxicity knowledge for common houseplants/garden plants — be accurate, not speculative
- If you are not confident about a plant's toxicity, default toxicToHumans and toxicToPets to true (safer default) rather than guessing false
- toxicityNote should only be non-null when there's a genuinely useful safety detail to add
- Return ONLY JSON.`;

type ToxicityCheck = { toxicToHumans: boolean; toxicToPets: boolean; toxicityNote: string | null };

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
    return {
      toxicToHumans: parsed.toxicToHumans,
      toxicToPets: parsed.toxicToPets,
      toxicityNote: typeof parsed.toxicityNote === 'string' ? parsed.toxicityNote : null,
    };
  } catch {
    return null;
  }
}

type ToxicityOverride = { toxicToHumans: boolean; toxicToPets: boolean; toxicityNote: string | null };

// Hardcoded, verified ASPCA/veterinary toxicity data for well-known plants — takes
// priority over both Gemini and Claude's assessments. Keywords favor genus Latin
// names (long, distinctive strings) over bare common fruit/herb words, since bare
// words like "lemon" or "mint" can appear as decorative cultivar epithets on
// unrelated plants (e.g. Philodendron 'Lemon Lime') and would wrongly override
// that plant's real toxicity profile.
const TOXICITY_OVERRIDES: { keywords: string[]; data: ToxicityOverride }[] = [
  {
    keywords: ['citrus', 'orange tree', 'lemon tree', 'lime tree', 'meyer lemon', 'key lime'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      toxicityNote: 'Essential oils and psoralens in leaves, peel, and stems are toxic to cats and dogs; fruit flesh is safe for humans.',
    },
  },
  {
    keywords: ['lilium', 'hemerocallis', 'daylily', 'day lily', 'tiger lily', 'easter lily', 'asiatic lily', 'oriental lily', 'stargazer lily', 'true lily'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      toxicityNote: 'Extremely toxic to cats specifically — even pollen or vase water can cause fatal kidney failure.',
    },
  },
  {
    keywords: ['pothos', 'epipremnum', "devil's ivy", 'devils ivy', 'scindapsus'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      toxicityNote: 'Calcium oxalate crystals cause oral burning and swelling in both humans and pets if chewed.',
    },
  },
  {
    keywords: ['aloe vera', 'aloe barbadensis'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      toxicityNote: 'Saponins and anthraquinones cause vomiting/diarrhea in pets; mild GI irritation in humans if ingested.',
    },
  },
  {
    keywords: ['crassula', 'jade plant'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      toxicityNote: 'Mildly toxic to cats and dogs — can cause vomiting, incoordination, or lethargy if chewed.',
    },
  },
  {
    keywords: ['sansevieria', 'snake plant', 'dracaena trifasciata', "mother-in-law's tongue", 'mother in law’s tongue'],
    data: {
      toxicToHumans: false,
      toxicToPets: true,
      toxicityNote: 'Mildly toxic to pets — saponins can cause drooling, vomiting, or diarrhea if chewed.',
    },
  },
  {
    keywords: ['peace lily', 'spathiphyllum'],
    data: {
      toxicToHumans: true,
      toxicToPets: true,
      toxicityNote: 'Calcium oxalate crystals cause oral burning, swelling, and drooling in humans and pets.',
    },
  },
  {
    keywords: ['basil', 'ocimum'],
    data: { toxicToHumans: false, toxicToPets: false, toxicityNote: null },
  },
  {
    keywords: ['rosemary', 'rosmarinus', 'salvia rosmarinus'],
    data: { toxicToHumans: false, toxicToPets: false, toxicityNote: null },
  },
  {
    keywords: ['mentha', 'peppermint', 'spearmint'],
    data: { toxicToHumans: false, toxicToPets: false, toxicityNote: null },
  },
  {
    keywords: ['thymus', 'thyme'],
    data: { toxicToHumans: false, toxicToPets: false, toxicityNote: null },
  },
  {
    keywords: ['echeveria'],
    data: { toxicToHumans: false, toxicToPets: false, toxicityNote: null },
  },
  {
    keywords: ['spider plant', 'chlorophytum comosum', 'chlorophytum'],
    data: {
      toxicToHumans: false,
      toxicToPets: false,
      toxicityNote: 'Contains mild compounds that can cause temporary "catnip-like" euphoria in cats, but is not dangerous.',
    },
  },
];

function findToxicityOverride(name: string, species: string): ToxicityOverride | null {
  const haystack = `${name} ${species}`.toLowerCase();
  for (const entry of TOXICITY_OVERRIDES) {
    if (entry.keywords.some(kw => haystack.includes(kw))) return entry.data;
  }
  return null;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

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

    // Independent toxicity double-check via Claude Haiku — never fails the scan.
    const claudeToxicity = await fetchClaudeToxicityCheck(parsed.name, parsed.species);
    if (claudeToxicity) {
      parsed.toxicToHumans = parsed.toxicToHumans || claudeToxicity.toxicToHumans;
      parsed.toxicToPets   = parsed.toxicToPets   || claudeToxicity.toxicToPets;
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
      parsed.toxicityNote  = toxicityOverride.toxicityNote;
    }

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
