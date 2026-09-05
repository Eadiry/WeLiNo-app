import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { useTheme } from '@hooks/persisted';
import type { MangaRow } from '@database/schema';

type ReaderMode = MangaRow['readerMode'];

const MODE_OPTIONS: { value: ReaderMode; label: string; icon: string }[] = [
  {
    value: 'pagedLtr',
    label: 'Paged (left to right)',
    icon: 'book-open-page-variant-outline',
  },
  {
    value: 'pagedRtl',
    label: 'Paged (right to left)',
    icon: 'book-open-page-variant-outline',
  },
  {
    value: 'pagedVertical',
    label: 'Paged (vertical)',
    icon: 'book-open-variant-outline',
  },
  {
    value: 'continuousLtr',
    label: 'Continuous (left to right)',
    icon: 'page-layout-header-footer',
  },
  {
    value: 'continuousRtl',
    label: 'Continuous (right to left)',
    icon: 'page-layout-header-footer',
  },
  {
    value: 'continuousVertical',
    label: 'Continuous (webtoon)',
    icon: 'page-layout-body',
  },
];

interface MangaReaderModePanelProps {
  visible: boolean;
  onDismiss: () => void;
  value: ReaderMode;
  onChange: (mode: ReaderMode) => void;
}

/**
 * Reading-mode picker, styled after a reference app's native-alert-style
 * sheet the user shared directly (a rounded card, one radio row per mode
 * with an icon, a "Cancel" text button) rather than the slide-in side
 * panel this component started as — that shape didn't match what was
 * actually being asked for, so this is a full replacement, not a tweak.
 * `pagedVertical` (discrete top-to-bottom page swipes, as opposed to
 * `continuousVertical`'s smooth scroll) is a new 6th mode added
 * specifically because the reference showed it as a distinct option this
 * app didn't have at all.
 */
const MangaReaderModePanel: React.FC<MangaReaderModePanelProps> = ({
  visible,
  onDismiss,
  value,
  onChange,
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
          <Text style={[styles.title, { color: theme.onSurface }]}>
            Reading Mode
          </Text>
          {MODE_OPTIONS.map(opt => {
            const selected = opt.value === value;
            return (
              <Pressable
                key={opt.value}
                style={styles.row}
                android_ripple={{ color: theme.rippleColor }}
                onPress={() => onChange(opt.value)}
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
          <View style={styles.footer}>
            <Pressable onPress={onDismiss} hitSlop={8}>
              <Text style={[styles.cancel, { color: theme.primary }]}>
                Cancel
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

export default MangaReaderModePanel;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  card: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingBottom: 24,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
  },
  footer: {
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  cancel: {
    fontSize: 16,
    fontWeight: '600',
  },
});
