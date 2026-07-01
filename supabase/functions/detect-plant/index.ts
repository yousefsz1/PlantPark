import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are an expert botanist and plant care specialist. Identify the plant in the photo and return EXACTLY this JSON (no markdown, no code fences, raw JSON only):

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
  "mistingDays": <number or null — misting interval in days, null if not needed>
}

Rules:
- wateringFrequency: "daily" = every 1-3 days, "weekly" = every 4-14 days, "monthly" = 15+ days
- wateringDays must match wateringFrequency (e.g. "weekly" with 7 days is valid)
- sunlight: "low" = shade-tolerant, "medium" = indirect light, "bright" = direct/strong indirect
- Always return all fields. If unsure, make a best guess. Return ONLY JSON.`;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const { image, mediaType } = await req.json();
    if (!image || !mediaType) throw new Error('Missing image or mediaType');

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const type = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: type, data: image },
              },
              { type: 'text', text: 'Identify this plant and return its care requirements as JSON.' },
            ],
          },
        ],
      }),
    });

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text();
      throw new Error(`Claude API error: ${err}`);
    }

    const result = await anthropicRes.json();
    const raw = result.content?.[0]?.text ?? '';

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
