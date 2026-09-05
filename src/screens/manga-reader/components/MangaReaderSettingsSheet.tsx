import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import Slider from '@components/Slider/Slider';
import { useTheme } from '@hooks/persisted';
import { MODE_OPTIONS, type ReaderMode } from './readerModes';

/**
 * The reader's settings sheet — a rounded bottom card (same
 * native-alert-style shell the reading-mode picker used, which the user
 * approved) listing the settings from the reference app that this reader
 * actually supports today: the reading mode and the side padding. Rotation
 * lock, crop borders and autoscroll are intentionally absent (rotation
 * needs a native module the user declined; the other two are their own
 * follow-ups) rather than shown as dead rows.
 */
interface MangaReaderSettingsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  mode: ReaderMode;
  onModeChange: (mode: ReaderMode) => void;
  sidePadding: number;
  onSidePaddingChange: (value: number) => void;
}

const MangaReaderSettingsSheet: React.FC<MangaReaderSettingsSheetProps> = ({
  visible,
  onDismiss,
  mode,
  onModeChange,
  sidePadding,
  onSidePaddingChange,
}) => {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Pressable
          style={[
            styles.card,
            { backgroundColor: theme.surface2 ?? theme.surface },
          ]}
          onPress={() => {}}
        >
          <ScrollView bounces={false}>
            <Text style={[styles.section, { color: theme.onSurfaceVariant }]}>
              Reading Mode
            </Text>
            {MODE_OPTIONS.map(opt => {
              const selected = opt.value === mode;
              return (
                <Pressable
                  key={opt.value}
                  style={styles.row}
                  android_ripple={{ color: theme.rippleColor }}
                  onPress={() => onModeChange(opt.value)}
                >
                  <MaterialCommunityIcons
                    name={selected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={22}
                    color={selected ? theme.primary : theme.onSurfaceVariant}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      { color: selected ? theme.primary : theme.onSurface },
                    ]}
                  >
                    {opt.label}
                  </Text>
                  <MaterialCommunityIcons
                    name={opt.icon as never}
                    size={22}
                    color={theme.onSurfaceVariant}
                  />
                </Pressable>
              );
            })}

            <View
              style={[styles.divider, { backgroundColor: theme.outline }]}
            />

            <View style={styles.paddingRow}>
              <Text style={[styles.label, { color: theme.onSurface }]}>
                Side padding
              </Text>
              <Text style={[styles.value, { color: theme.onSurfaceVariant }]}>
                {Math.round(sidePadding * 100)}%
              </Text>
            </View>
            <Slider
              style={styles.slider}
              value={sidePadding}
              min={0}
              max={0.25}
              step={0.01}
              onValueChange={onSidePaddingChange}
              onSlidingComplete={onSidePaddingChange}
            />

            <View style={styles.footer}>
              <Pressable onPress={onDismiss} hitSlop={8}>
                <Text style={[styles.close, { color: theme.primary }]}>
                  Close
                </Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default MangaReaderSettingsSheet;

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    flex: 1,
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '80%',
    paddingBottom: 24,
    paddingHorizontal: 8,
    paddingTop: 16,
  },
  close: { fontSize: 16, fontWeight: '600' },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 8 },
  footer: { alignItems: 'flex-end', paddingHorizontal: 16, paddingTop: 12 },
  label: { fontSize: 16 },
  paddingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  rowLabel: { flex: 1, fontSize: 16 },
  section: {
    fontSize: 13,
    fontWeight: '600',
    paddingBottom: 8,
    paddingHorizontal: 16,
  },
  slider: { marginHorizontal: 12 },
  value: { fontSize: 14 },
});
