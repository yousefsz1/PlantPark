import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Image,
  Dimensions,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Favourite, FavouriteFolder } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_SIZE = (SCREEN_WIDTH - Spacing.md * 2 - Spacing.sm) / 2;

type FolderFilter = 'all' | 'unsorted' | string;

function FavouriteCard({
  favourite,
  onPress,
  onLongPress,
}: {
  favourite: Favourite;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.82}
    >
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

function FolderChip({
  label,
  active,
  onPress,
  onLongPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      activeOpacity={0.75}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Bottom sheet listing "Unsorted" + every folder — tap one to move the
// favourite into it.
function AssignFolderModal({
  visible,
  favourite,
  folders,
  onClose,
  onAssign,
}: {
  visible: boolean;
  favourite: Favourite | null;
  folders: FavouriteFolder[];
  onClose: () => void;
  onAssign: (folderId: string | null) => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle} numberOfLines={1}>
            Move {favourite?.name ?? 'favourite'} to…
          </Text>
          <ScrollView style={styles.assignList} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={styles.assignRow}
              onPress={() => onAssign(null)}
              activeOpacity={0.75}
            >
              <Ionicons name="ellipse-outline" size={18} color={Colors.textMuted} />
              <Text style={styles.assignRowText}>Unsorted</Text>
              {favourite?.folder_id === null && (
                <Ionicons name="checkmark" size={18} color={Colors.primary} />
              )}
            </TouchableOpacity>
            {folders.map(folder => (
              <TouchableOpacity
                key={folder.id}
                style={styles.assignRow}
                onPress={() => onAssign(folder.id)}
                activeOpacity={0.75}
              >
                <Ionicons name="folder-outline" size={18} color={Colors.primary} />
                <Text style={styles.assignRowText} numberOfLines={1}>{folder.name}</Text>
                {favourite?.folder_id === folder.id && (
                  <Ionicons name="checkmark" size={18} color={Colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
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

function EmptyFolder() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  return (
    <View style={styles.emptyWrap}>
      <Ionicons name="folder-open-outline" size={48} color={Colors.textMuted} />
      <Text style={styles.emptyTitle}>Nothing here yet</Text>
      <Text style={styles.emptyBody}>
        Long-press a favourite and choose a list to move it here.
      </Text>
    </View>
  );
}

export default function FavouritesScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const router = useRouter();
  const [favourites, setFavourites] = useState<Favourite[]>([]);
  const [folders, setFolders] = useState<FavouriteFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<FolderFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assigningFavourite, setAssigningFavourite] = useState<Favourite | null>(null);

  const fetchData = useCallback(async () => {
    setError(null);
    const [favRes, folderRes] = await Promise.all([
      supabase.from('favourites').select('*').order('created_at', { ascending: false }),
      supabase.from('favourite_folders').select('*').order('created_at', { ascending: true }),
    ]);

    if (favRes.error) setError(favRes.error.message);
    else setFavourites(favRes.data ?? []);

    if (!folderRes.error) setFolders(folderRes.data ?? []);
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

  const handleCreateFolder = useCallback(async (name: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error: err } = await supabase
      .from('favourite_folders')
      .insert({ user_id: user.id, name })
      .select('*')
      .single();
    if (err || !data) {
      Alert.alert('Error', err?.message ?? 'Failed to create folder');
      return;
    }
    setFolders(prev => [...prev, data]);
  }, []);

  const handleCreateFolderPrompt = useCallback(() => {
    Alert.prompt(
      'New Folder',
      'Enter a name for this folder',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Create',
          onPress: (name?: string) => {
            if (name && name.trim()) handleCreateFolder(name.trim());
          },
        },
      ],
    );
  }, [handleCreateFolder]);

  const handleRenameFolder = useCallback(async (folder: FavouriteFolder, name: string) => {
    const { data, error: err } = await supabase
      .from('favourite_folders')
      .update({ name })
      .eq('id', folder.id)
      .select('*')
      .single();
    if (err || !data) {
      Alert.alert('Error', err?.message ?? 'Failed to rename folder');
      return;
    }
    setFolders(prev => prev.map(f => (f.id === folder.id ? data : f)));
  }, []);

  const handleDeleteFolder = useCallback((folder: FavouriteFolder) => {
    Alert.alert(
      `Delete "${folder.name}"?`,
      'Favourites in this list will become Unsorted — they will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error: err } = await supabase.from('favourite_folders').delete().eq('id', folder.id);
            if (err) {
              Alert.alert('Error', err.message);
              return;
            }
            setFolders(prev => prev.filter(f => f.id !== folder.id));
            setFavourites(prev => prev.map(f => (f.folder_id === folder.id ? { ...f, folder_id: null } : f)));
            setSelectedFolder(prev => (prev === folder.id ? 'all' : prev));
          },
        },
      ],
    );
  }, []);

  const handleRenameFolderPrompt = useCallback((folder: FavouriteFolder) => {
    Alert.prompt(
      'Rename Folder',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (name?: string) => {
            if (name && name.trim()) handleRenameFolder(folder, name.trim());
          },
        },
      ],
      'plain-text',
      folder.name,
    );
  }, [handleRenameFolder]);

  const handleLongPressFolderChip = useCallback((folder: FavouriteFolder) => {
    Alert.alert(
      folder.name,
      'What would you like to do with this list?',
      [
        { text: 'Rename', onPress: () => handleRenameFolderPrompt(folder) },
        { text: 'Delete', style: 'destructive', onPress: () => handleDeleteFolder(folder) },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [handleDeleteFolder, handleRenameFolderPrompt]);

  const handleAssignFolder = useCallback(async (folderId: string | null) => {
    if (!assigningFavourite) return;
    const favourite = assigningFavourite;
    // .select() is required here, not just .update() — without it, an
    // update blocked by RLS (or matching zero rows for any other reason)
    // still comes back as `error: null` with no way to tell it apart from
    // a real success. Checking the returned rows is what actually catches
    // a silent no-op failure.
    const { data, error: err } = await supabase
      .from('favourites')
      .update({ folder_id: folderId })
      .eq('id', favourite.id)
      .select('id');
    if (err) {
      Alert.alert('Error', err.message);
      return;
    }
    if (!data || data.length === 0) {
      Alert.alert('Error', 'Could not move this favourite. Please try again.');
      return;
    }
    setFavourites(prev => prev.map(f => (f.id === favourite.id ? { ...f, folder_id: folderId } : f)));
    setAssigningFavourite(null);
  }, [assigningFavourite]);

  const filteredFavourites = favourites.filter(f => {
    if (selectedFolder === 'all') return true;
    if (selectedFolder === 'unsorted') return f.folder_id === null;
    return f.folder_id === selectedFolder;
  });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Favourites</Text>
      </View>

      {!loading && !error && favourites.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <FolderChip label="All" active={selectedFolder === 'all'} onPress={() => setSelectedFolder('all')} />
          <FolderChip
            label="Unsorted"
            active={selectedFolder === 'unsorted'}
            onPress={() => setSelectedFolder('unsorted')}
          />
          {folders.map(folder => (
            <FolderChip
              key={folder.id}
              label={folder.name}
              active={selectedFolder === folder.id}
              onPress={() => setSelectedFolder(folder.id)}
              onLongPress={() => handleLongPressFolderChip(folder)}
            />
          ))}
          <TouchableOpacity
            style={styles.addChip}
            onPress={handleCreateFolderPrompt}
            activeOpacity={0.75}
          >
            <Ionicons name="add" size={18} color={Colors.primary} />
          </TouchableOpacity>
        </ScrollView>
      )}

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
          data={filteredFavourites}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[
            styles.content,
            filteredFavourites.length === 0 && styles.contentCentered,
          ]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />
          }
          ListEmptyComponent={
            favourites.length === 0 ? (
              <EmptyFavourites onScan={() => router.push('/(tabs)/scan')} />
            ) : (
              <EmptyFolder />
            )
          }
          renderItem={({ item }) => (
            <FavouriteCard
              favourite={item}
              onPress={() => router.push(`/favourite/${item.id}`)}
              onLongPress={() => setAssigningFavourite(item)}
            />
          )}
        />
      )}

      <AssignFolderModal
        visible={assigningFavourite !== null}
        favourite={assigningFavourite}
        folders={folders}
        onClose={() => setAssigningFavourite(null)}
        onAssign={handleAssignFolder}
      />
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.md },
  title: { fontSize: FontSize.hero, fontWeight: '700', color: Colors.textPrimary },

  // paddingTop lives here (not conditionally) so the grid and the empty
  // state both start at the same offset below the chip row — previously
  // contentCentered's justifyContent: 'center' vertically centered the
  // empty state within the full remaining height, which visually read as
  // an extra gap versus the top-anchored grid.
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm, paddingBottom: Spacing.xl },
  contentCentered: { flexGrow: 1 },
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

  // Folder chips
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: Radius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: 160,
  },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  chipTextActive: { color: Colors.textPrimary },
  addChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Bottom sheets (folder name modal + assign-to-folder modal)
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: Radius.xl,
    borderTopRightRadius: Radius.xl,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
    gap: Spacing.md,
    maxHeight: '75%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: Radius.full,
    backgroundColor: Colors.border,
    alignSelf: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },

  assignList: { flexGrow: 0 },
  assignRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.md,
  },
  assignRowText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },

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
