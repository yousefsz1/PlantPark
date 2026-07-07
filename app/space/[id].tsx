import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput,
  Modal,
  Image,
  Animated,
  PanResponder,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Space, Plant } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import PlantCard from '../../components/PlantCard';

// Wider than the Garden screen's 80px delete action to fit the "Remove from [Space]" label
const DELETE_ACTION_WIDTH = 104;

function SwipeableSpacePlantRow({
  plant,
  spaceName,
  removing,
  onPress,
  onRemove,
}: {
  plant: Plant;
  spaceName: string;
  removing: boolean;
  onPress: () => void;
  onRemove: () => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const trans = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);

  const springTo = (val: number) =>
    Animated.spring(trans, { toValue: val, useNativeDriver: true, bounciness: 0, speed: 20 }).start();

  const close = useCallback(() => {
    openRef.current = false;
    springTo(0);
  }, []);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -DELETE_ACTION_WIDTH : 0;
        trans.setValue(Math.max(-DELETE_ACTION_WIDTH, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -DELETE_ACTION_WIDTH : 0;
        const final = Math.max(-DELETE_ACTION_WIDTH, Math.min(0, base + g.dx));
        if (final < -(DELETE_ACTION_WIDTH / 2)) {
          openRef.current = true;
          springTo(-DELETE_ACTION_WIDTH);
        } else {
          openRef.current = false;
          springTo(0);
        }
      },
    })
  ).current;

  return (
    <View style={styles.swipeRow}>
      {/* Remove-from-Space action revealed on swipe-left */}
      <TouchableOpacity
        style={[styles.removeAction, removing && { opacity: 0.6 }]}
        onPress={() => { close(); onRemove(); }}
        activeOpacity={0.85}
        disabled={removing}
      >
        {removing ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="exit-outline" size={18} color="#FFFFFF" />
            <Text style={styles.removeActionText} numberOfLines={2}>Remove from {spaceName}</Text>
          </>
        )}
      </TouchableOpacity>

      {/* Card — slides left on swipe */}
      <Animated.View style={{ transform: [{ translateX: trans }] }} {...pan.panHandlers}>
        <TouchableOpacity
          onPress={() => {
            if (openRef.current) { close(); return; }
            onPress();
          }}
          activeOpacity={0.82}
        >
          <PlantCard plant={plant} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

export default function SpaceDetailScreen() {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const params = useLocalSearchParams<{ id: string }>();
  const spaceId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();

  const [space, setSpace]         = useState<Space | null>(null);
  const [allPlants, setAllPlants] = useState<Plant[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!spaceId) return;
    const [spaceRes, plantsRes] = await Promise.all([
      supabase.from('spaces').select('*').eq('id', spaceId).maybeSingle(),
      supabase.from('plants').select('*').order('created_at', { ascending: true }),
    ]);
    setSpace(spaceRes.data);
    setAllPlants(plantsRes.data ?? []);
  }, [spaceId]);

  useFocusEffect(
    useCallback(() => {
      fetchData().finally(() => setLoading(false));
    }, [fetchData]),
  );

  const plants = allPlants.filter(p => p.space_id === spaceId);
  const assignablePlants = allPlants.filter(p => p.space_id !== spaceId);

  const handleAssignPlant = useCallback(async (plantId: string) => {
    if (!spaceId) return;
    setAssigningId(plantId);
    try {
      const { error } = await supabase.from('plants').update({ space_id: spaceId }).eq('id', plantId);
      if (error) throw error;
      setAllPlants(prev => prev.map(p => (p.id === plantId ? { ...p, space_id: spaceId } : p)));
      setShowAssignModal(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to assign plant');
    } finally {
      setAssigningId(null);
    }
  }, [spaceId]);

  const handleRemoveFromSpace = useCallback((plant: Plant) => {
    if (!space) return;
    Alert.alert(
      `Remove ${plant.name} from ${space.name}?`,
      "It will stay in Your Plants — this only unassigns it from this Space.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(plant.id);
            try {
              const { error } = await supabase.from('plants').update({ space_id: null }).eq('id', plant.id);
              if (error) throw error;
              setAllPlants(prev => prev.map(p => (p.id === plant.id ? { ...p, space_id: null } : p)));
              setToastMessage(`Removed from ${space.name} — still in Your Plants`);
              setTimeout(() => setToastMessage(null), 2200);
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to remove plant from Space');
            } finally {
              setRemovingId(null);
            }
          },
        },
      ],
    );
  }, [space]);

  const startRename = useCallback(() => {
    if (!space) return;
    setNameInput(space.name);
    setRenaming(true);
  }, [space]);

  const saveRename = useCallback(async () => {
    if (!space || !nameInput.trim() || savingName) return;
    setSavingName(true);
    try {
      const { error } = await supabase
        .from('spaces')
        .update({ name: nameInput.trim() })
        .eq('id', space.id);
      if (error) throw error;
      setSpace(prev => (prev ? { ...prev, name: nameInput.trim() } : prev));
      setRenaming(false);
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to rename Space');
    } finally {
      setSavingName(false);
    }
  }, [space, nameInput, savingName]);

  const handleDelete = useCallback(() => {
    if (!space) return;
    if (plants.length > 0) {
      Alert.alert(
        'Space not empty',
        `This Space has ${plants.length} plant${plants.length === 1 ? '' : 's'} in it. Remove all plants from this Space before deleting it.`,
        [{ text: 'OK' }],
      );
      return;
    }
    Alert.alert(
      `Delete ${space.name}?`,
      "This can't be undone.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const { error } = await supabase.from('spaces').delete().eq('id', space.id);
              if (error) throw error;
              router.back();
            } catch (err) {
              Alert.alert('Error', err instanceof Error ? err.message : 'Failed to delete Space');
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [space, plants.length, router]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  if (!space) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>Space not found</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>← Go back</Text>
          </TouchableOpacity>
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

        {renaming ? (
          <View style={styles.renameRow}>
            <TextInput
              style={styles.renameInput}
              value={nameInput}
              onChangeText={setNameInput}
              autoFocus
              maxLength={40}
              editable={!savingName}
              onSubmitEditing={saveRename}
            />
            <TouchableOpacity onPress={saveRename} disabled={savingName || !nameInput.trim()}>
              {savingName ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Ionicons name="checkmark-circle" size={26} color={Colors.primary} />
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.titleRow} onPress={startRename} activeOpacity={0.7}>
            <Text style={styles.headerTitle} numberOfLines={1}>{space.name}</Text>
            <Ionicons name="pencil-outline" size={16} color={Colors.textMuted} />
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={styles.assignIconBtn}
          onPress={() => setShowAssignModal(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.trashBtn, deleting && styles.disabled]}
          onPress={handleDelete}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color={Colors.danger} />
          ) : (
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.plantCount}>
          {plants.length} plant{plants.length === 1 ? '' : 's'} in this Space
        </Text>

        {toastMessage ? (
          <View style={styles.toast}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.primary} />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        ) : null}

        {plants.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="leaf-outline" size={40} color={Colors.textMuted} style={{ opacity: 0.6 }} />
            <Text style={styles.emptyText}>No plants assigned to this Space yet.</Text>
          </View>
        ) : (
          plants.map(p => (
            <SwipeableSpacePlantRow
              key={p.id}
              plant={p}
              spaceName={space.name}
              removing={removingId === p.id}
              onPress={() => router.push(p.is_grass ? `/grass/${p.id}` : `/plant/${p.id}`)}
              onRemove={() => handleRemoveFromSpace(p)}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={showAssignModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.backdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowAssignModal(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>Assign a Plant</Text>
            <ScrollView style={styles.assignList} showsVerticalScrollIndicator={false}>
              {assignablePlants.length === 0 ? (
                <Text style={styles.emptyText}>No other plants available to assign.</Text>
              ) : (
                assignablePlants.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.assignRow}
                    onPress={() => handleAssignPlant(p.id)}
                    disabled={assigningId === p.id}
                    activeOpacity={0.75}
                  >
                    {p.photo_url ? (
                      <Image source={{ uri: p.photo_url }} style={styles.assignThumb} />
                    ) : (
                      <View style={[styles.assignThumb, styles.assignThumbPlaceholder]}>
                        <Ionicons name="leaf-outline" size={18} color={Colors.textMuted} />
                      </View>
                    )}
                    <Text style={styles.assignName} numberOfLines={1}>{p.name}</Text>
                    {assigningId === p.id ? (
                      <ActivityIndicator size="small" color={Colors.primary} />
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.background },
    centered: { flex: 1, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center' },
    notFoundText: { fontSize: FontSize.lg, color: Colors.textPrimary },
    backLink: { marginTop: Spacing.md },
    backLinkText: { fontSize: FontSize.sm, color: Colors.primary },
    disabled: { opacity: 0.6 },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    backBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
    },
    titleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
    headerTitle: { fontSize: FontSize.xl, fontWeight: '700', color: Colors.textPrimary, flexShrink: 1 },
    renameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
    renameInput: {
      flex: 1,
      fontSize: FontSize.lg,
      fontWeight: '700',
      color: Colors.textPrimary,
      borderBottomWidth: 1.5,
      borderBottomColor: Colors.primary,
      paddingVertical: 2,
    },
    assignIconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
    },
    trashBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: Colors.surfaceElevated,
      justifyContent: 'center',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: 'rgba(231,76,60,0.4)',
    },

    content: { padding: Spacing.md, paddingBottom: Spacing.xxl },
    plantCount: {
      fontSize: FontSize.sm,
      color: Colors.textMuted,
      marginBottom: Spacing.sm,
    },

    toast: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'center',
      gap: 6,
      backgroundColor: Colors.surfaceElevated,
      borderWidth: 1,
      borderColor: Colors.primary,
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.sm,
      borderRadius: Radius.full,
      marginBottom: Spacing.sm,
    },
    toastText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.textPrimary },

    swipeRow: {
      marginBottom: Spacing.sm,
      position: 'relative',
      overflow: 'hidden',
      borderRadius: Radius.lg,
    },
    removeAction: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: DELETE_ACTION_WIDTH,
      backgroundColor: Colors.danger,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: Spacing.xs,
      borderRadius: Radius.lg,
    },
    removeActionText: { fontSize: FontSize.xs, fontWeight: '700', color: '#FFFFFF', textAlign: 'center' },

    emptyBox: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: Spacing.xxl,
      gap: Spacing.sm,
    },
    emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

    // Assign-plant modal
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
    assignList: { gap: Spacing.sm },
    assignRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      padding: Spacing.sm,
      marginBottom: Spacing.sm,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    assignThumb: { width: 40, height: 40, borderRadius: Radius.sm, backgroundColor: Colors.surfaceElevated },
    assignThumbPlaceholder: { justifyContent: 'center', alignItems: 'center' },
    assignName: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.textPrimary },
  });
}
