import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Favourite } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm) / 2;

function FavouriteCard({ favourite, onPress }: { favourite: Favourite; onPress: () => void }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.82}>
      {favourite.photo_url ? (
        <Image source={{ uri: favourite.photo_url }} style={styles.cardPhoto} resizeMode="cover" />
      ) : (
        <View style={styles.cardPhotoPlaceholder}>
          <Ionicons name="heart" size={26} color={Colors.danger} />
        </View>
      )}
      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{favourite.name}</Text>
        {favourite.species ? (
          <Text style={styles.cardSpecies} numberOfLines={1}>{favourite.species}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function EmptyFavourites({ onScan }: { onScan: () => void }) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="heart-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>No favourites yet</Text>
      <Text style={styles.emptyBody}>
        Tap the heart icon on a scanned plant to save it here for reference.
      </Text>
      <TouchableOpacity style={styles.scanBtn} onPress={onScan}>
        <Ionicons name="scan-outline" size={20} color={Colors.textPrimary} />
        <Text style={styles.scanBtnText}>Scan a Plant</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function FavouritesScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    const { data, error: err } = await supabase
      .from('favourites')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) setError(err.message);
    else setFavourites(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchData().finally(() => setLoading(false));
    }, [fetchData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Favourites</Text>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Ionicons name="warning-outline" size={32} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchData}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={favourites}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.content,
            favourites.length === 0 && styles.contentCentered,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={<EmptyFavourites onScan={() => router.push('/(tabs)/scan')} />}
          renderItem={({ item }) => (
            <FavouriteCard favourite={item} onPress={() => router.push(`/favourite/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },

  content: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xl },
  contentCentered: { flexGrow: 1, justifyContent: 'center' },
  row: { gap: Spacing.sm },

  card: {
    width: CARD_SIZE,
    marginBottom: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  cardPhoto: { width: '100%', height: CARD_SIZE, backgroundColor: Colors.surfaceElevated },
  cardPhotoPlaceholder: {
    width: '100%',
    height: CARD_SIZE,
    backgroundColor: Colors.surfaceElevated,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardInfo: { padding: Spacing.sm, gap: 2 },
  cardName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.textPrimary },
  cardSpecies: { fontSize: FontSize.xs, color: Colors.textSecondary, fontStyle: 'italic' },

  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: Spacing.sm, padding: Spacing.lg },
  errorText: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: {
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: Radius.md,
  },
  retryText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },

  emptyWrap: { alignItems: 'center', gap: Spacing.sm, paddingHorizontal: Spacing.xl },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary, marginTop: Spacing.sm },
  emptyBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center', lineHeight: 20 },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
  },
  scanBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  });
}
