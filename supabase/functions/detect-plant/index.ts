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
  "isHealthy": <boolean — true if plant looks healthy, false if visible problems detected>,
  "healthScore": <integer 0-100 — your honest assessment of the plant's current visible health:
    95-100 = perfect health, vibrant colour, no issues;
    75-94 = mostly healthy, very minor cosmetic issues (tiny spots, one slightly yellow leaf);
    50-74 = clearly visible stress — yellowing leaves, leaf curl, minor pests, wilting tips;
    25-49 = significant problems affecting several leaves or growth points;
    0-24 = severe decline, widespread damage, or near-dead.
    Must be consistent: isHealthy true → healthScore ≥ 70; isHealthy false → healthScore < 70>,
  "healthIssues": [<string> — list visible problems e.g. "Yellow leaves", "Brown leaf tips", "Signs of pests", "Wilting stems". Empty array [] if healthy.],
  "remedies": [<string> — exactly 2-3 specific actionable home remedies or prevention tips, max 120 chars each]
}

Rules:
- wateringFrequency: "daily" = every 1-3 days, "weekly" = every 4-14 days, "monthly" = 15+ days
- wateringDays must match wateringFrequency (e.g. "weekly" with 7 days is valid)
- sunlight: "low" = shade-tolerant, "medium" = indirect light, "bright" = direct/strong indirect
- healthScore must reflect what you actually see in the photo — do not default to 100 if there are visible issues
- If isHealthy is true: healthIssues must be [] and remedies should be 2-3 general prevention tips
- If isHealthy is false: healthIssues lists 1-3 visible problems; remedies must address each with a specific, practical home fix
- remedies must always have exactly 2-3 entries — never fewer, never more
- Always return all fields. If unsure, make a best guess. Return ONLY JSON.`;

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

    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
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
      }),
    });

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
