import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator, Share, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../../lib/supabase';
import { getScanStatus, type MembershipTier } from '../../lib/scanLimits';
import { getLevel, xpToNextLevel } from '../../lib/levels';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { APP_DOWNLOAD_URL } from '../../constants/links';
import type { User } from '@supabase/supabase-js';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function getTierBadgeConfig(Colors: ColorPalette): Record<MembershipTier, { label: string; icon: string; color: string; bg: string }> {
  return {
    free:  { label: 'Free Plan',  icon: 'leaf-outline', color: Colors.textSecondary, bg: Colors.surfaceElevated },
    basic: { label: 'Basic Plan', icon: 'flash',        color: Colors.primary,       bg: 'rgba(46,204,113,0.12)' },
    pro:   { label: 'Pro Plan',   icon: 'diamond',      color: Colors.rare,          bg: 'rgba(155,89,182,0.15)' },
  };
}

// Badges are computed from REAL data (previously the whole grid was
// hardcoded — every new account showed "7-Day Streak" etc. as unlocked).
// Streak/Rare Find/Expert stay locked until their tracking systems exist.
function getBadges(plantCount: number, totalXP: number) {
  return [
    { id: '1', icon: 'leaf',    label: 'First Plant',  unlocked: plantCount > 0 },
    { id: '2', icon: 'flame',   label: '7-Day Streak', unlocked: false },
    { id: '3', icon: 'trophy',  label: 'Green Thumb',  unlocked: getLevel(totalXP).minXP >= 1800 },
    { id: '4', icon: 'star',    label: 'Rare Find',    unlocked: false },
    { id: '5', icon: 'ribbon',  label: 'Garden Sage',  unlocked: getLevel(totalXP).minXP >= 7000 },
    { id: '6', icon: 'diamond', label: 'Master',       unlocked: getLevel(totalXP).minXP >= 12000 },
  ] as const;
}

// "Reminders" was removed — it was a dead row with no route or action.
const MENU_ITEMS = [
  { icon: 'podium-outline',        label: 'Global Ranking', route: '/leaderboard', action: undefined },
  { icon: 'card-outline',          label: 'Membership',   route: '/membership', action: undefined },
  { icon: 'settings-outline',      label: 'Settings',      route: '/settings',   action: undefined },
  { icon: 'share-social-outline',  label: 'Share App',     route: undefined,     action: 'share' as const },
  { icon: 'help-circle-outline',   label: 'Help & FAQ',    route: '/help',       action: undefined },
] as const;

export default function ProfileScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [tier, setTier] = useState<MembershipTier>('free');
  const [totalXP, setTotalXP] = useState(0);
  const [plantCount, setPlantCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useFocusEffect(
    useCallback(() => {
      supabase.auth.getUser().then(({ data }) => setUser(data.user));
      getScanStatus().then((status) => setTier(status?.tier ?? 'free'));
      supabase.from('profiles').select('total_xp, avatar_url').maybeSingle().then(({ data }) => {
        setTotalXP(data?.total_xp ?? 0);
        setAvatarUrl(data?.avatar_url ?? null);
      });
      supabase.from('plants').select('id', { count: 'exact', head: true }).then(({ count }) => {
        setPlantCount(count ?? 0);
      });
    }, []),
  );

  // Pick a photo → square-crop → resize to 256px → upload to the user's own
  // storage folder → save the URL via RPC (direct profile writes are blocked
  // by design). A unique filename per upload avoids stale CDN caches.
  const handleChangeAvatar = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'] as ImagePicker.MediaType[],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (picked.canceled || !picked.assets?.[0]) return;

    setUploadingAvatar(true);
    try {
      const compressed = await ImageManipulator.manipulateAsync(
        picked.assets[0].uri,
        [{ resize: { width: 256 } }],
        { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG, base64: true },
      );
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not signed in');

      const bytes = Uint8Array.from(atob(compressed.base64!), c => c.charCodeAt(0));
      const path = `${authUser.id}/avatar-${Date.now()}.jpg`;
      const { data: up, error: upErr } = await supabase.storage
        .from('plant-images')
        .upload(path, bytes, { contentType: 'image/jpeg' });
      if (upErr || !up) throw new Error(upErr?.message ?? 'Upload failed');

      const { data: urlData } = supabase.storage.from('plant-images').getPublicUrl(up.path);
      const { error: rpcErr } = await supabase.rpc('set_avatar_url', { p_url: urlData.publicUrl });
      if (rpcErr) throw rpcErr;

      setAvatarUrl(urlData.publicUrl);
    } catch (err) {
      Alert.alert('Could not update photo', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setUploadingAvatar(false);
    }
  }, []);

  const handleShareApp = useCallback(() => {
    Share.share({
      message: `Check out Plant Park — the app I use to take care of my plants and lawn: ${APP_DOWNLOAD_URL}`,
      url: APP_DOWNLOAD_URL,
    }).catch(() => {});
  }, []);

  async function handleSignOut() {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          setSigningOut(true);
          try {
            await supabase.auth.signOut();
            // Navigation back to auth happens automatically via onAuthStateChange in _layout.tsx
          } finally {
            // Reset in case sign-out failed — otherwise the spinner spins forever.
            setSigningOut(false);
          }
        },
      },
    ]);
  }

  const displayEmail = user?.email ?? '—';
  const displayName = user?.user_metadata?.display_name ?? displayEmail.split('@')[0];
  const tierBadge = getTierBadgeConfig(Colors)[tier];
  const level = getLevel(totalXP);
  const { pct, needed } = xpToNextLevel(totalXP);
  const isMaxLevel = needed === 0;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Avatar & name — tap the photo to change it */}
        <View style={styles.avatarSection}>
          <TouchableOpacity onPress={handleChangeAvatar} disabled={uploadingAvatar} activeOpacity={0.8}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={styles.avatar}>
                <Text style={styles.avatarInitials}>{getInitials(displayName)}</Text>
              </View>
            )}
            <View style={styles.avatarCameraBadge}>
              {uploadingAvatar ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Ionicons name="camera" size={13} color="#FFFFFF" />
              )}
            </View>
          </TouchableOpacity>
          <Text style={styles.username}>{displayName}</Text>
          <Text style={styles.userEmail}>{displayEmail}</Text>
          <View style={styles.rankBadge}>
            <Ionicons name={level.icon as any} size={12} color={Colors.primary} />
            <Text style={styles.rankText}>{level.name}</Text>
          </View>
          <TouchableOpacity
            style={[styles.tierBadge, { backgroundColor: tierBadge.bg }]}
            onPress={() => router.push('/membership')}
            activeOpacity={0.75}
          >
            <Ionicons name={tierBadge.icon as any} size={12} color={tierBadge.color} />
            <Text style={[styles.tierBadgeText, { color: tierBadge.color }]}>{tierBadge.label}</Text>
          </TouchableOpacity>
        </View>

        {/* XP progress */}
        <TouchableOpacity
          style={styles.xpCard}
          activeOpacity={0.85}
          onPress={() => router.push({ pathname: '/rank-roadmap', params: { totalXP: String(totalXP) } })}
        >
          <View style={styles.xpRow}>
            <Text style={styles.xpLabel}>{totalXP.toLocaleString()} XP</Text>
            <Text style={styles.xpNext}>
              {isMaxLevel ? 'Max level reached!' : `Next rank at ${(totalXP + needed).toLocaleString()} XP`}
            </Text>
          </View>
          <View style={styles.xpBarBg}>
            <View style={[styles.xpBarFill, { width: `${pct}%` }]} />
          </View>
        </TouchableOpacity>

        {/* Badges */}
        <Text style={styles.sectionTitle}>Badges</Text>
        <View style={styles.badgesGrid}>
          {getBadges(plantCount, totalXP).map((b) => (
            <View key={b.id} style={[styles.badge, !b.unlocked && styles.badgeLocked]}>
              <Ionicons
                name={b.icon as any}
                size={24}
                color={b.unlocked ? Colors.xp : Colors.textMuted}
              />
              <Text style={[styles.badgeLabel, !b.unlocked && styles.badgeLabelLocked]}>
                {b.label}
              </Text>
            </View>
          ))}
        </View>

        {/* Account menu */}
        <Text style={styles.sectionTitle}>Account</Text>
        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.menuRow}
            onPress={
              item.action === 'share' ? handleShareApp :
              item.route ? () => router.push(item.route) :
              undefined
            }
          >
            <Ionicons name={item.icon as any} size={20} color={Colors.textSecondary} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        ))}

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={handleSignOut}
          disabled={signingOut}
          activeOpacity={0.75}
        >
          {signingOut ? (
            <ActivityIndicator size="small" color={Colors.danger} />
          ) : (
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          )}
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xxl },

  avatarSection: { alignItems: 'center', marginVertical: Spacing.lg },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  avatarInitials: { fontSize: FontSize.xxl, fontWeight: '700', color: '#FFFFFF' },
  avatarCameraBadge: {
    position: 'absolute',
    bottom: Spacing.sm - 2,
    right: -2,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  username: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
  userEmail: { fontSize: FontSize.sm, color: Colors.textMuted, marginTop: 2, marginBottom: 6 },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surfaceElevated,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  rankText: { fontSize: FontSize.sm, color: Colors.textSecondary },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
    marginTop: 6,
  },
  tierBadgeText: { fontSize: FontSize.sm, fontWeight: '700' },

  xpCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
  },
  xpRow: { flexDirection: 'row', justifyContent: 'space-between' },
  xpLabel: { fontSize: FontSize.md, fontWeight: '700', color: Colors.xp },
  xpNext: { fontSize: FontSize.xs, color: Colors.textMuted },
  xpBarBg: {
    height: 6,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  xpBarFill: { height: '100%', backgroundColor: Colors.xp, borderRadius: Radius.full },

  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
  },

  badgesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  badge: {
    width: '30%',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  badgeLocked: { opacity: 0.4 },
  badgeLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, textAlign: 'center' },
  badgeLabelLocked: { color: Colors.textMuted },

  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  menuLabel: { flex: 1, fontSize: FontSize.md, color: Colors.textPrimary },

  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: 'rgba(231,76,60,0.1)',
  },
  signOutText: { fontSize: FontSize.md, fontWeight: '600', color: Colors.danger },
  });
}
