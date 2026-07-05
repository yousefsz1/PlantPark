import { useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { Spacing, Radius, type ColorPalette, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';
import type { Space } from '../types/database';

const PRESETS: { label: string; icon: string }[] = [
  { label: 'Living Room', icon: 'home-outline' },
  { label: 'Bedroom',     icon: 'bed-outline' },
  { label: 'Kitchen',     icon: 'restaurant-outline' },
  { label: 'Balcony',     icon: 'sunny-outline' },
  { label: 'Garden',      icon: 'leaf-outline' },
  { label: 'Office',      icon: 'briefcase-outline' },
  { label: 'Other',       icon: 'ellipsis-horizontal-outline' },
];

// Shared create-Space sheet — used from the Garden screen's "+ New Space"
// card and from the Add Plant flow's "Which Space?" picker.
export default function CreateSpaceModal({
  visible,
  onClose,
  onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: (space: Space) => void;
}) {
  const { Colors, FontSize } = useTheme();
  const styles = getStyles(Colors, FontSize);
  const [customName, setCustomName] = useState('');
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setCustomName('');
    setShowCustomInput(false);
    setSaving(false);
  };

  const handleClose = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const createSpace = async (name: string) => {
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('spaces')
        .insert({ user_id: user.id, name: name.trim() })
        .select('*')
        .single();
      if (error || !data) throw new Error(error?.message ?? 'Failed to create Space');

      onCreated(data);
      reset();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to create Space');
      setSaving(false);
    }
  };

  const handlePreset = (label: string) => {
    if (label === 'Other') {
      setShowCustomInput(true);
      return;
    }
    createSpace(label);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>New Space</Text>

          {showCustomInput ? (
            <>
              <TextInput
                style={styles.input}
                placeholder="Space name"
                placeholderTextColor={Colors.textMuted}
                value={customName}
                onChangeText={setCustomName}
                autoFocus
                maxLength={40}
                editable={!saving}
              />
              <TouchableOpacity
                style={[styles.saveBtn, (!customName.trim() || saving) && styles.saveBtnDisabled]}
                onPress={() => createSpace(customName)}
                disabled={!customName.trim() || saving}
                activeOpacity={0.85}
              >
                {saving ? (
                  <ActivityIndicator size="small" color={Colors.textPrimary} />
                ) : (
                  <Text style={styles.saveBtnText}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.presetGrid}>
              {PRESETS.map(({ label, icon }) => (
                <TouchableOpacity
                  key={label}
                  style={styles.presetChip}
                  onPress={() => handlePreset(label)}
                  disabled={saving}
                  activeOpacity={0.75}
                >
                  <Ionicons name={icon as any} size={20} color={Colors.primary} />
                  <Text style={styles.presetChipText}>{label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getStyles(Colors: ColorPalette, FontSize: FontSizeScale) {
  return StyleSheet.create({
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
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: Radius.full,
      backgroundColor: Colors.border,
      alignSelf: 'center',
      marginBottom: Spacing.xs,
    },
    title: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.textPrimary },

    presetGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
    presetChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      width: '47%',
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    presetChipText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textPrimary },

    input: {
      backgroundColor: Colors.surface,
      borderRadius: Radius.md,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: Spacing.md,
      fontSize: FontSize.md,
      color: Colors.textPrimary,
    },
    saveBtn: {
      backgroundColor: Colors.primary,
      borderRadius: Radius.full,
      paddingVertical: 14,
      alignItems: 'center',
    },
    saveBtnDisabled: { opacity: 0.5 },
    saveBtnText: { fontSize: FontSize.md, fontWeight: '700', color: Colors.textPrimary },
  });
}
