import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// RevenueCat → Supabase membership sync. This is now the ONLY writer of
// profiles.membership_tier (the client's direct write was removed — it was
// both unnecessary and an exploit vector, since the same RLS policy let any
// user grant themselves 'pro').
//
// Setup (one-time):
// 1. supabase secrets set REVENUECAT_WEBHOOK_SECRET=<long random string>
// 2. RevenueCat dashboard → Integrations → Webhooks →
//      URL:  https://<project-ref>.supabase.co/functions/v1/revenuecat-webhook
//      Authorization header: Bearer <same random string>
// 3. config.toml: [functions.revenuecat-webhook] verify_jwt = false
//    (RevenueCat has no Supabase JWT; auth is the shared secret instead)
//
// app_user_id is the Supabase user id because the app calls
// Purchases.logIn(session.user.id) on login (_layout.tsx).

serve(async (req: Request) => {
  const secret = Deno.env.get('REVENUECAT_WEBHOOK_SECRET');
  const auth = req.headers.get('Authorization') ?? '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { event } = await req.json();
    if (!event?.app_user_id) {
      return new Response(JSON.stringify({ skipped: 'no app_user_id' }), { status: 200 });
    }

    // Anonymous RevenueCat ids (before logIn ran) can't be mapped to a user.
    const userId: string = event.app_user_id;
    if (userId.startsWith('$RCAnonymousID:')) {
      return new Response(JSON.stringify({ skipped: 'anonymous id' }), { status: 200 });
    }

    const entitlements: string[] = event.entitlement_ids ?? [];
    const type: string = event.type ?? '';

    let tier: 'free' | 'basic' | 'pro' | null = null;
    if (type === 'EXPIRATION') {
      tier = 'free';
    } else if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'TRANSFER'].includes(type)) {
      if (entitlements.includes('pro_access')) tier = 'pro';
      else if (entitlements.includes('basic_access')) tier = 'basic';
    }
    // CANCELLATION (auto-renew turned off) keeps access until EXPIRATION —
    // intentionally no tier change there.

    if (!tier) {
      return new Response(JSON.stringify({ skipped: `unhandled type ${type}` }), { status: 200 });
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { error } = await admin.from('profiles').update({ membership_tier: tier }).eq('id', userId);
    if (error) throw error;

    return new Response(JSON.stringify({ updated: userId, tier }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    // Non-2xx makes RevenueCat retry automatically — desirable for transient DB errors.
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});
