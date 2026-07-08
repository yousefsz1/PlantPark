import { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, Dimensions, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Spacing, Radius, type FontSizeScale } from '../constants/theme';
import { useTheme } from '../contexts/ThemeContext';

const SCREEN_WIDTH = Dimensions.get('window').width;

export type GalleryPhoto = { id: string; photo_url: string; created_at: string };

export function formatPhotoDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function getPhotoLabel(photos: GalleryPhoto[], index: number): string {
  const date = formatPhotoDate(photos[index].created_at);
  if (photos.length === 2) {
    return `${date} · ${index === 0 ? 'First photo' : 'Latest photo'}`;
  }
  return date;
}

// Full-screen swipeable photo viewer — shared by the Plant Detail growth
// timeline and the Grass Detail photo timeline. Pass the merged/sorted photo
// list and the index to open at; the component owns its own swipe position
// once open.
export default function PhotoViewerModal({
  visible,
  photos,
  initialIndex,
  onClose,
}: {
  visible: boolean;
  photos: GalleryPhoto[];
  initialIndex: number;
  onClose: () => void;
}) {
  const { FontSize } = useTheme();
  const styles = getStyles(FontSize);
  const [index, setIndex] = useState(initialIndex);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (visible) {
      setIndex(initialIndex);
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: initialIndex * SCREEN_WIDTH, animated: false });
      });
    }
  }, [visible, initialIndex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
          <Ionicons name="close" size={26} color="#FFFFFF" />
        </TouchableOpacity>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => {
            const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setIndex(idx);
          }}
        >
          {photos.map((photo) => (
            <View key={photo.id} style={styles.slide}>
              <Image source={{ uri: photo.photo_url }} style={styles.image} resizeMode="contain" />
            </View>
          ))}
        </ScrollView>

        <View style={styles.footer}>
          {photos[index] ? (
            <Text style={styles.label}>{getPhotoLabel(photos, index)}</Text>
          ) : null}
          {photos.length > 1 && (
            <View style={styles.dots}>
              {photos.map((photo, i) => (
                <View key={photo.id} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

function getStyles(FontSize: FontSizeScale) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000' },
    closeBtn: {
      position: 'absolute',
      top: Platform.OS === 'ios' ? 56 : 24,
      right: Spacing.md,
      zIndex: 1,
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.15)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    slide: { width: SCREEN_WIDTH, flex: 1, justifyContent: 'center', alignItems: 'center' },
    image: { width: SCREEN_WIDTH, height: '100%' },
    footer: {
      position: 'absolute',
      bottom: Platform.OS === 'ios' ? 48 : 24,
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: Spacing.sm,
    },
    label: {
      fontSize: FontSize.sm,
      fontWeight: '600',
      color: '#FFFFFF',
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: Radius.full,
    },
    dots: { flexDirection: 'row', gap: 6 },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: 'rgba(255,255,255,0.4)',
    },
    dotActive: {
      backgroundColor: '#FFFFFF',
      width: 8,
      height: 8,
      borderRadius: 4,
    },
  });
}
