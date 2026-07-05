import { useState, useCallback } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import type { Space, Plant } from '../../types/database';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import PlantCard from '../../components/PlantCard';

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
    Alert.alert(
      `Delete ${space.name}?`,
      "This won't delete the plants inside it — they'll just be unassigned from this Space.",
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
  }, [space, router]);

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

        {plants.length === 0 ? (
          <View style={styles.emptyBox}>
            <Ionicons name="leaf-outline" size={40} color={Colors.textMuted} style={{ opacity: 0.6 }} />
            <Text style={styles.emptyText}>No plants assigned to this Space yet.</Text>
          </View>
        ) : (
          plants.map(p => (
            <TouchableOpacity
              key={p.id}
              style={styles.plantRowWrap}
              onPress={() => router.push(`/plant/${p.id}`)}
              activeOpacity={0.82}
            >
              <PlantCard plant={p} />
            </TouchableOpacity>
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
    plantRowWrap: { marginBottom: Spacing.sm },

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
