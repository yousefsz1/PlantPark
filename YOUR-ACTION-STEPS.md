# Your Action Steps — after the Fable 5 fix session (18 Jul 2026)

Everything below is copy-paste ready. Do them in this order.

---

## Step 1 — Run the security SQL (5 min, do this TODAY)

Supabase Dashboard → SQL Editor → paste the entire contents of
**`deploy_security_fixes.sql`** → Run.

What it does: removes the policy that let any user set themselves to Pro
for free, replaces client-controlled XP with fixed server-side amounts,
and locks scan counting to the server.

Safe for the app version currently in App Store review: old builds'
now-blocked calls are all fire-and-forget with error handling, so they
fail silently without breaking anything.

## Step 2 — Deploy the updated edge functions (5 min, do this TODAY)

From `~/Desktop/PlantPark`:

```bash
supabase functions deploy detect-plant
supabase functions deploy analyze-grass-health
supabase functions deploy delete-account
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

Then verify the deploy actually ran (your rule!): Dashboard → Edge
Functions → check each function's "Updated" timestamp is just now.

## Step 3 — Delete the two dead functions (2 min)

They were never called by the app and were an open door for burning your
API credits:

```bash
supabase functions delete identify-plant
supabase functions delete analyze-plant
```

## Step 4 — Wire the RevenueCat webhook (10 min)

This is now the ONLY thing that sets membership_tier in the database.
Without it, purchases won't unlock Basic/Pro.

1. Generate a random secret (Terminal): `openssl rand -hex 32` — copy the output.
2. `supabase secrets set REVENUECAT_WEBHOOK_SECRET=<paste the output>`
3. RevenueCat dashboard → your project → Integrations → Webhooks → Add:
   - URL: `https://xiqexeullniezghwdjfb.supabase.co/functions/v1/revenuecat-webhook`
   - Authorization header value: `Bearer <same secret>`
4. Send the test event from the RevenueCat dashboard and check the
   function's logs in Supabase show a 200.

## Step 5 — Android RevenueCat API key (2 min)

RevenueCat dashboard → Project settings → API keys → copy the key
starting with `goog_`, then paste it into **`app/_layout.tsx`** line 20:

```ts
const REVENUECAT_ANDROID_API_KEY = 'goog_XXXXXXXX';
```

Without this, Android cannot purchase at all.

## Step 6 — Confirm the service role key rotation

From the earlier exposure: confirm the key was rotated AND the pg_cron
job for check-rainfall was updated with the new key (it authenticates
with that key in the `apikey` header — if only rotated, Smart Watering
silently stopped working).

## Step 7 — App Store Connect check (2 min)

My Apps → Plant Park → your submission: confirm all 4 subscription
products (basic/pro × monthly/yearly) are attached to the version and
show "Waiting for Review". Unattached IAPs are the #1 rejection cause
for subscription apps.

## Step 8 — Test on device (15 min)

```bash
cd ~/Desktop/PlantPark && EXPO_OFFLINE=1 npx expo start -c
```

Check: normal scan works and the count rises in the profiles table;
scanning past the limit shows the limit alert; membership screen shows
live store prices + "Most Popular" on Pro; light mode looks right
(status bar, scan status badges); profile badges reflect reality on a
fresh account.

## Step 9 — Ship 1.0.1

Whatever Apple decides on the current build, the client fixes need a new
build (`eas build`). If approved: release, then push 1.0.1. If rejected:
1.0.1 IS the resubmission — you're ready either way.

---

## Decisions I made that you should know about

1. **Health re-checks on the plant detail screen now count as scans** —
   they call the same Gemini endpoint, and server-side enforcement can't
   tell callers apart. Previously they were free. Tell me if you want a
   separate uncounted path for re-checks.
2. **"Powered by Claude AI" → rotating tips** during analysis (it's
   Gemini doing the scan — the label was wrong and a trademark risk).
3. **Free users no longer get +30 XP when blocked at the grass paywall**
   (the scan still counts server-side because the Gemini call ran).
4. **add_plant XP stays 50 per plant added** (matching existing behavior),
   now server-enforced.
5. **Profile badges**: First Plant / Green Thumb / Garden Sage / Master
   are real now; 7-Day Streak and Rare Find show locked until those
   systems exist.
6. **Old builds in the wild**: their direct increment/update calls now
   fail silently (all were fire-and-forget) — no crashes, no double
   counting.
