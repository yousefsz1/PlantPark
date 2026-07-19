import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { checkScanAllowance, recordScans } from '../_shared/scanGuard.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Model to use — update if Google releases a newer flash variant
const GEMINI_MODEL = 'gemini-2.5-flash';

const SYSTEM_PROMPT = `You are an expert lawn care specialist analyzing 3 photos of the same residential lawn: 1) the whole lawn from a normal standing view, 2) its worst-looking area, 3) its best-looking area. Return EXACTLY this JSON (no markdown, no code fences, raw JSON only):

{
  "issues": [<string> — 1-4 short, specific visible problems, e.g. "Patchy bare spot near the fence", "Yellowing in the shaded corner". Empty array [] if the lawn looks uniformly healthy.>],
  "tips": [<string> — exactly 3-5 actionable, specific tips based on what you actually see across all 3 photos, max 100 chars each, e.g. "Overseed the bare patch this month", "Reduce mowing height slightly to reduce stress">],
  "healthLevel": <integer 1-5 — overall lawn health: 1 = severe issues (large dead/bare areas, widespread problems), 2 = significant issues, 3 = moderate/mixed condition, 4 = mostly healthy with minor issues, 5 = excellent, uniformly healthy>,
  "fertilizerRecommendation": <string — ONE specific fertilizer recommendation for THIS lawn's visible condition, max 110 chars, beginner-friendly with an N-P-K example, e.g. "Slow-release high-nitrogen lawn feed (around 20-5-10 NPK) once it's watered regularly". Include a caution instead if fertilizing now would harm the lawn (e.g. severe drought stress).>
}

Rules:
- Base your assessment on all 3 photos together, not just one — the "worst spot" photo will naturally look worse than the "whole lawn" photo, that's expected and not itself a sign of severe overall health.
- issues must be empty [] only when healthLevel is 4 or 5 and nothing notable stands out.
- tips must always have exactly 3-5 entries, tailored to what's actually visible in these specific photos — not generic filler advice.
- healthLevel must be consistent with issues: an empty issues list should not pair with healthLevel 1 or 2.
- fertilizerRecommendation must match the visible condition: drought-stressed or dormant lawns should be told to water first / wait, not to fertilize immediately.
- Return ONLY JSON.`;

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

type ImageInput = { image: string; mediaType: string };

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Lawn Health Scan sends 3 images in one Gemini call → counts as 3 scans,
  // and the feature itself is Basic/Pro only — both enforced server-side now.
  const guard = await checkScanAllowance(req, 3, CORS, { requirePaidTier: true });
  if (!guard.ok) return guard.response;

  try {
    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) throw new Error('GEMINI_API_KEY not configured');

    const { images } = await req.json();
    if (!Array.isArray(images) || images.length !== 3) {
      throw new Error('Expected exactly 3 images: whole lawn, worst spot, best spot');
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const imageParts = (images as ImageInput[]).map(({ image, mediaType }) => {
      if (!image || !mediaType) throw new Error('Each image needs an image and mediaType');
      const type = validTypes.includes(mediaType) ? mediaType : 'image/jpeg';
      return { inline_data: { mime_type: type, data: image } };
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

    const geminiRes = await fetchGeminiWithRetry(url, JSON.stringify({
      system_instruction: {
        parts: [{ text: SYSTEM_PROMPT }],
      },
      contents: [
        {
          parts: [
            ...imageParts,
            { text: 'Photo 1 is the whole lawn, photo 2 is its worst-looking spot, photo 3 is its best-looking spot. Analyze this lawn and return the JSON.' },
          ],
        },
      ],
      generation_config: {
        response_mime_type: 'application/json',
        max_output_tokens: 1024,
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

    const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
    const parsed = JSON.parse(jsonStr);

    // Meter the 3 scans server-side (replaces the client-side increment).
    await recordScans(guard.admin, guard.userId, 3);

    // Expose under the snake_case names the client/DB expects.
    parsed.health_level = parsed.healthLevel;
    delete parsed.healthLevel;
    parsed.fertilizer_recommendation = parsed.fertilizerRecommendation ?? null;
    delete parsed.fertilizerRecommendation;

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
