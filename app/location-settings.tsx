import { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../lib/supabase';
import { useDeviceLocation, searchCity, setManualLocation, type GeocodeResult } from '../lib/location';
import { getScanStatus } from '../lib/scanLimits';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

function formatUpdatedAt(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  return `${diffDays} days ago`;
}

export default function LocationSettingsScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();

  const [current, setCurrent] = useState<{ latitude: number; longitude: number; updatedAt: string | null } | null>(null);
  const [usingDevice, setUsingDevice] = useState(false);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [selecting, setSelecting] = useState<string | null>(null);
  const [smartWateringEnabled, setSmartWateringEnabled] = useState(true);
  const [checkingAccess, setCheckingAccess] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await getScanStatus();
      if (cancelled) return;
      if (status?.tier === 'free') {
        Alert.alert(
          'Upgrade Required',
          'Smart Watering is a Basic/Pro feature — upgrade to unlock automatic rain detection for your outdoor plants and lawn.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => router.back() },
            { text: 'View Plans', onPress: () => { router.back(); router.push('/membership'); } },
          ],
          { onDismiss: () => router.back() },
        );
        return;
      }
      setCheckingAccess(false);
    })();
    return () => { cancelled = true; };
  }, [router]);

  useFocusEffect(
    useCallback(() => {
      supabase
        .from('profiles')
        .select('latitude, longitude, location_updated_at, smart_watering_enabled')
        .maybeSingle()
        .then(({ data }) => {
          if (data?.latitude != null && data?.longitude != null) {
            setCurrent({ latitude: data.latitude, longitude: data.longitude, updatedAt: data.location_updated_at });
          }
          if (data?.smart_watering_enabled != null) {
            setSmartWateringEnabled(data.smart_watering_enabled);
          }
        });
    }, []),
  );

  const handleToggleSmartWatering = useCallback(async (value: boolean) => {
    setSmartWateringEnabled(value);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ smart_watering_enabled: value }).eq('id', user.id);
    if (error) {
      setSmartWateringEnabled(!value);
      Alert.alert('Error', 'Failed to update Auto Rain Detection. Please try again.');
    }
  }, []);

  const handleUseDevice = useCallback(async () => {
    setUsingDevice(true);
    try {
      const { latitude, longitude } = await useDeviceLocation();
      setCurrent({ latitude, longitude, updatedAt: new Date().toISOString() });
      Alert.alert('Location updated', 'Smart Watering will now use your device location for rainfall checks.');
    } catch (err) {
      Alert.alert(
        'Could not get location',
        err instanceof Error ? err.message : 'Please try again, or search for your city below.',
      );
    } finally {
      setUsingDevice(false);
    }
  }, []);

  const handleSearch = useCallback(async () => {
    setSearching(true);
    try {
      const found = await searchCity(query);
      setResults(found);
    } finally {
      setSearching(false);
    }
  }, [query]);

  const handleSelectCity = useCallback(async (result: GeocodeResult) => {
    setSelecting(result.name);
    try {
      await setManualLocation(result.latitude, result.longitude);
      setCurrent({ latitude: result.latitude, longitude: result.longitude, updatedAt: new Date().toISOString() });
      setResults([]);
      setQuery('');
      Alert.alert('Location updated', `Using ${result.name}${result.country ? `, ${result.country}` : ''} for rainfall checks.`);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to save location');
    } finally {
      setSelecting(null);
    }
  }, []);

  if (checkingAccess) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Location</Text>
          <View style={styles.headerSpacer} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color={Colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Location</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.explainer}>
          Used for Smart Watering — Plant Park checks local rainfall and automatically skips
          watering reminders for outdoor plants and lawns after it rains.
        </Text>

        {current ? (
          <View style={styles.currentCard}>
            <Ionicons name="location" size={18} color={Colors.primary} />
            <Text style={styles.currentText}>
              {current.latitude.toFixed(2)}°, {current.longitude.toFixed(2)}°
              {current.updatedAt ? ` · updated ${formatUpdatedAt(current.updatedAt)}` : ''}
            </Text>
          </View>
        ) : (
          <View style={styles.currentCard}>
            <Ionicons name="location-outline" size={18} color={Colors.textMuted} />
            <Text style={styles.currentTextMuted}>No location set yet</Text>
          </View>
        )}

        <TouchableOpacity style={styles.primaryBtn} onPress={handleUseDevice} disabled={usingDevice} activeOpacity={0.85}>
          {usingDevice ? (
            <ActivityIndicator size="small" color={Colors.textPrimary} />
          ) : (
            <>
              <Ionicons name="navigate" size={18} color={Colors.textPrimary} />
              <Text style={styles.primaryBtnText}>Use My Location</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.orText}>or search for your city</Text>

        <View style={styles.searchRow}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="City name"
            placeholderTextColor={Colors.textMuted}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
          />
          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={searching || !query.trim()}>
            {searching ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Ionicons name="search" size={18} color={Colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        {results.map((r) => (
          <TouchableOpacity
            key={`${r.name}-${r.latitude}-${r.longitude}`}
            style={styles.resultRow}
            onPress={() => handleSelectCity(r)}
            disabled={selecting === r.name}
            activeOpacity={0.75}
          >
            <Ionicons name="location-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.resultText} numberOfLines={1}>
              {r.name}{r.admin1 ? `, ${r.admin1}` : ''}{r.country ? `, ${r.country}` : ''}
            </Text>
            {selecting === r.name ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
          </TouchableOpacity>
        ))}

        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>Auto Rain Detection</Text>
            <Switch
              value={smartWateringEnabled}
              onValueChange={handleToggleSmartWatering}
              trackColor={{ false: Colors.surfaceElevated, true: Colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
          <Text style={styles.toggleDescription}>
            Automatically mark outdoor watering done when enough rain falls at your location. Turn off to always water manually.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary },
    headerSpacer: { width: 38 },

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    explainer: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 20, marginBottom: Spacing.md },

    currentCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginBottom: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    currentText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },
    currentTextMuted: { fontSize: FontSize.sm, color: Colors.textMuted },

    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingVertical: Spacing.md,
    },
    primaryBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
    orText: { fontSize: FontSize.xs, color: Colors.textMuted, textAlign: 'center', marginVertical: Spacing.md },

    searchRow: { flexDirection: 'row', gap: Spacing.sm },
    searchInput: {
      flex: 1,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      fontSize: FontSize.md,
      color: Colors.textPrimary,
    },
    searchBtn: {
      width: 44,
      height: 44,
      borderRadius: Radius.md,
      backgroundColor: Colors.surface,
      borderWidth: 1,
      borderColor: Colors.border,
      justifyContent: 'center',
      alignItems: 'center',
    },

    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      padding: Spacing.md,
      marginTop: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    resultText: { flex: 1, fontSize: FontSize.sm, color: Colors.textPrimary },

    toggleCard: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.md,
      marginTop: Spacing.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      gap: 6,
    },
    toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    toggleLabel: { fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
    toggleDescription: { fontSize: FontSize.xs, color: Colors.textMuted, lineHeight: 18 },
  });
}
