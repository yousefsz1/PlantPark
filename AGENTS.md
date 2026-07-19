# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.

# Security architecture (changed 18 Jul 2026 — read before touching XP, scans, or membership)

- **profiles table has no client UPDATE policy.** All writes to `profiles` go through SECURITY DEFINER RPCs or the service role. Do not add a client-side `.from('profiles').update(...)` call — it will fail (intentionally).
- **XP is awarded via `supabase.rpc('award_xp', { p_action })`** (see `lib/scanLimits.ts`), not `increment_xp`. Valid actions: `'scan' | 'new_species' | 'add_plant'`. The dollar amount per action lives server-side in the SQL function — never pass an amount from the client.
- **Scan counting happens server-side inside the edge functions** (`detect-plant`, `analyze-grass-health`), not the client. See `supabase/functions/_shared/scanGuard.ts`. There is no client-callable `incrementScanCount` anymore — don't re-add one.
- **membership_tier is set ONLY by `supabase/functions/revenuecat-webhook`**, driven by RevenueCat's server-to-server webhook events. The membership screen reads live tier from RevenueCat's `CustomerInfo` for instant UI feedback, but the database write is the webhook's job, not the client's.
- **push_token is saved via `supabase.rpc('set_push_token', { p_token })`**, not a direct profiles update.
- `identify-plant` and `analyze-plant` edge functions were deleted (unused, unprotected). Don't recreate them without adding scanGuard protection first.
- Full context: see `REVIEW-FINDINGS.md` and `YOUR-ACTION-STEPS.md` in the project root for the full audit and fix list from this date.

# Smart Care (added 18 Jul 2026)

- Seasonal schedules: `get_seasonal_multiplier_v2(user_id, task_type)` adjusts next-due dates on task completion — watering (outdoor/grass only): summer 0.75/winter 1.5; fertilizing (all plants): winter 2.0/spring 0.8. Hemisphere from profiles.latitude.
- Heatwave alerts: `check-rainfall` edge function (3-hourly cron) also checks 3-day forecast max temps; ≥32°C pulls upcoming outdoor waterings 1 day earlier (once per task, tracked via care_tasks.heat_adjusted_at) + Expo push.
- Both rain-skip and heat candidates RPCs are gated to membership_tier IN ('basic','pro') server-side.
- Planned next (1.1): health-aware nudges, Care Timeline screen.

# RevenueCat

- iOS is configured (`app/_layout.tsx`). Android is NOT yet added to the RevenueCat project — no Android app exists there yet, so `REVENUECAT_ANDROID_API_KEY` in `_layout.tsx` is a placeholder. Do this when Yousef is ready to start Google Play closed testing (needs a Google Play service account connected in RevenueCat first).
- Webhook secret is `REVENUECAT_WEBHOOK_SECRET` (Supabase secret) and must exactly match the Authorization header configured on the RevenueCat webhook. If you ever regenerate this secret, you MUST update the RevenueCat webhook's Authorization header to match, or membership sync silently breaks (401s, tier never updates). Verify with "Send test event" in RevenueCat → Integrations → Webhooks after any change.

# Working style

- Yousef is not a developer — always explain in plain language, give copy-paste-ready commands, and confirm before doing anything destructive or costly.
- Prefers concise, direct responses.
- Server-side/SQL changes are low-risk to apply immediately (no app store review needed). Client-side (app) changes require a new build + App Store/Play submission — batch these rather than shipping one at a time.
