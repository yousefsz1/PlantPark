# PlantPark — Fable 5 Code & UI Review (18 Jul 2026)

Reviewed: all lib/, all 6 edge functions, schema.sql RLS policies, scan.tsx, membership.tsx, _layout.tsx, index.tsx, profile.tsx, theme system, app.json. Nothing changed yet — findings only.

---

## CRITICAL — security / revenue (fix before launch)

### 1. Anyone can give themselves Pro for free
`schema.sql` policy "Users can update own profile" allows updating **any** column, including `membership_tier`. A user with their own JWT can call the Supabase REST API directly and set `membership_tier = 'pro'` — no purchase needed. `membership.tsx` even relies on this same client-side write (`syncMembershipTier`) to record real purchases, which confirms the door is open.
**Fix:** block client updates to `membership_tier` (trigger or column-level check in the policy), and set the tier server-side via a RevenueCat webhook → edge function using the service role key.

### 2. Scan limits are enforced only in the client
`detect-plant` never checks the caller's scan count. The app checks `getScanStatus()` before calling, but anyone can invoke the edge function directly with a free account's JWT and run unlimited Gemini scans — you pay for every one.
**Fix:** inside `detect-plant`, resolve the user from the JWT, call `get_scan_status`, reject if over limit, and increment server-side (removes the client's fire-and-forget increment too).

### 3. XP is client-controlled
`increment_xp(xp_amount)` accepts any amount from the client — `supabase.rpc('increment_xp', { xp_amount: 999999 })` works. Same policy also lets users write `total_xp` directly. Cosmetic today, but poisonous if you ever add leaderboards/social.
**Fix:** replace with parameterless RPCs per action (`award_scan_xp`, etc.) with server-defined amounts.

### 4. Service role key rotation (carried over)
The exposed key from the earlier debugging session — confirm it's been rotated and the cron/vault SQL updated. Note `check-rainfall` authenticates by comparing the `apikey` header to the service role key, so rotation must update the pg_cron job too.

---

## HIGH — launch blockers & real bugs

### 5. RevenueCat is iOS-only — Android can't purchase
`_layout.tsx` line 47: `Purchases.configure` runs only when `Platform.OS === 'ios'`. Android (your primary launch platform) never configures the SDK — `getOfferings()` fails, the membership screen shows no packages, and every purchase attempt dies. Needs the Google Play API key + configure on both platforms.

### 6. Hardcoded prices on the membership screen
`membership.tsx` shows "$2.99/month or $19.99/year" as static text. Store prices vary by region and change in App Store Connect / Play Console; a mismatch between displayed and charged price is an App Store rejection risk. Use `pkg.product.priceString` from the loaded packages instead.

### 7. Profile badges are 100% fake
`profile.tsx` `BADGES` array hardcodes "7-Day Streak", "Level 5", "First Plant" as unlocked for every user, including brand-new accounts. Broader than the known streak-badge issue. Review/trust risk. Fix or hide the section for v1.

### 8. "Powered by Claude AI" — but scans use Gemini
Scan analyzing screen says "Powered by Claude AI"; `detect-plant` is Gemini 2.5 Flash (Claude Haiku only double-checks toxicity). Inaccurate + trademark exposure. Suggest neutral: "Analyzing with AI…".

### 9. Free users burn a scan on the grass paywall
In `scan.tsx`, when grass is detected for a free user: the Gemini call already ran, `incrementScanCount()` fires, +30 XP is awarded — then they're blocked by the upgrade alert. One of their 5 monthly scans gone for nothing. Also a redundant second `getScanStatus()` network call here — reuse the first result.

### 10. Dead edge functions
`identify-plant` and `analyze-plant` are never invoked by the app (verified via grep) and have **no auth-independent cost protection** — plus both reference model `claude-sonnet-4-6`. Delete them from the Supabase project, or they're just attack surface for burning your Anthropic credits.

---

## MEDIUM — bugs & consistency

11. **Light mode is broken in three ways:** (a) `app.json` has `userInterfaceStyle: "dark"`, so ThemeContext's "system" option can never resolve to light; (b) `<StatusBar style="light" />` is hardcoded — near-invisible status bar on the cream background; (c) ~29 hardcoded dark hex values in screens (scan status-badge backgrounds `#0B2A14`/`#2E1E00`, error box `#2D1010`, analyzing overlay) that don't adapt.
12. **Stale-closure bug in `index.tsx` `handleCompleteTask`** — uses `totalXP` for the level-up journal check but omits it from the deps array; level-up entries can fire wrongly or not at all.
13. **`delete-account` only deletes 1000 files** — `.list(userId, { limit: 1000 })` with no pagination. Heavy users would leave orphaned photos behind after GDPR deletion.
14. **"Reminders" row in Profile does nothing** — `onPress` is undefined; a visibly tappable dead row.
15. **Sign-out spinner never resets on failure** — `setSigningOut(true)` with no `finally`.
16. **Emoji in section labels** (`🏠`, `🔬` in scan results) — contradicts your own Ionicons-only rule for rendering consistency.

---

## UI/UX suggestions (opinion)

The design system itself is solid — consistent tokens, good dark palette, cohesive cards. Highest-impact polish, in order:

1. **Membership screen is your money screen and it's the plainest screen in the app.** Add a "Most Popular" highlight on Basic or Pro, show the yearly saving ("Save ~44%") instead of a flat two-price string, and pull real localized prices (fixes #6 at the same time). This is the single highest-ROI UI change.
2. **Sticky "Save to Garden" CTA on the scan result** — it's currently below ~6 scrollable sections; users who don't scroll to the bottom never save. Pin it as a footer bar.
3. **Analyzing screen**: rotate 3–4 short plant-fact/tip lines during the ~3s wait instead of static text — makes the wait feel shorter.
4. **Haptics** (`expo-haptics`): capture button, task Done, XP award. Cheap, big perceived-quality gain for a gamified app.
5. **Animate the XP banner** ("+30 XP") with a small scale/fade-in — currently pops in statically despite being the core reward moment.
6. **Badges**: if kept for v1, wire "First Plant" (real) and hide the rest as "Coming soon" rather than fake-unlocked.

---

## Suggested fix batches (your approval per batch)

- **Batch A (server security):** #1, #2, #3, #10 — SQL + edge function changes, copy-paste SQL provided.
- **Batch B (payments):** #5, #6 + membership screen redesign (UI-1).
- **Batch C (client bugs):** #8, #9, #12, #13, #14, #15, #16.
- **Batch D (light mode):** #11.
- **Batch E (UI polish):** UI-2 through UI-6.
