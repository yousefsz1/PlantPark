import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Called every 3 hours by a pg_cron job (see deploy_smart_watering_cron.sql)
// via the service role key — there is no logged-in user for this request,
// so it uses SECURITY DEFINER RPCs that trust each care_tasks row's own
// user_id instead of auth.uid().

const RAIN_THRESHOLD_MM = 5;
const MAX_LOOKBACK_DAYS = 14;

type Candidate = {
  task_id: string;
  plant_id: string;
  user_id: string;
  interval_days: number;
  last_watered: string | null;
  latitude: number;
  longitude: number;
};

// Best-effort — looks up the user's push token and the plant's name, then
// POSTs to Expo's push API. Never throws: a missing token, a lookup
// failure, or a push-send failure should just mean no notification, not a
// broken batch (the rain-completion itself already succeeded).
async function sendRainWateredPush(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  plantId: string,
): Promise<void> {
  try {
    const [{ data: profile }, { data: plant }] = await Promise.all([
      supabase.from('profiles').select('push_token').eq('id', userId).maybeSingle(),
      supabase.from('plants').select('name').eq('id', plantId).maybeSingle(),
    ]);

    const pushToken = profile?.push_token;
    if (!pushToken) return;

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: pushToken,
        title: 'Rain watered your plant! 🌧️',
        body: `${plant?.name ?? 'Your plant'} was auto-watered thanks to today's rainfall.`,
      }),
    });
  } catch {
    // Non-fatal — see comment above.
  }
}

serve(async (req: Request) => {
  const expectedKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const providedKey = req.headers.get('apikey');

  if (!providedKey || providedKey !== expectedKey) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: candidates, error } = await supabase.rpc('get_rain_check_candidates');
    if (error) throw error;

    const rows = (candidates ?? []) as Candidate[];
    if (rows.length === 0) {
      return new Response(JSON.stringify({ processed: 0, completed: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Group by rounded lat/long so a user with several outdoor plants at the
    // same location triggers one Open-Meteo call, not one per plant.
    const byLocation = new Map<string, Candidate[]>();
    for (const c of rows) {
      const key = `${c.latitude.toFixed(2)},${c.longitude.toFixed(2)}`;
      const group = byLocation.get(key);
      if (group) group.push(c);
      else byLocation.set(key, [c]);
    }

    let completed = 0;
    const now = Date.now();

    for (const [key, group] of byLocation) {
      const [lat, lon] = key.split(',');

      let maxDays = 1;
      for (const c of group) {
        const lastWatered = c.last_watered ? new Date(c.last_watered).getTime() : now;
        const days = Math.ceil((now - lastWatered) / (1000 * 60 * 60 * 24));
        maxDays = Math.max(maxDays, Math.min(MAX_LOOKBACK_DAYS, Math.max(1, days)));
      }

      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=precipitation_sum&past_days=${maxDays}&timezone=auto`;
      const weatherRes = await fetch(url);
      if (!weatherRes.ok) continue;

      const weather = await weatherRes.json();
      const dates: string[] = weather.daily?.time ?? [];
      const amounts: number[] = weather.daily?.precipitation_sum ?? [];

      for (const c of group) {
        const lastWateredDate = c.last_watered ? new Date(c.last_watered) : null;
        let totalRain = 0;
        for (let i = 0; i < dates.length; i++) {
          if (!lastWateredDate || new Date(dates[i]) >= lastWateredDate) {
            totalRain += amounts[i] ?? 0;
          }
        }

        if (totalRain >= RAIN_THRESHOLD_MM) {
          const { error: completeErr } = await supabase.rpc('complete_care_task_via_rain', {
            p_task_id: c.task_id,
            p_rain_mm: Math.round(totalRain * 10) / 10,
          });
          if (!completeErr) {
            completed++;
            await sendRainWateredPush(supabase, c.user_id, c.plant_id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ processed: rows.length, completed }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
