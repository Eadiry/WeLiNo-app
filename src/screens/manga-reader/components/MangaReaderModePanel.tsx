import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import color from 'color';

import { IconButtonV2, Menu } from '@components';
import { useTheme } from '@hooks/persisted';
import type { MangaRow } from '@database/schema';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type ReaderMode = MangaRow['readerMode'];

const MODE_OPTIONS: { value: ReaderMode; label: string }[] = [
  { value: 'pagedLtr', label: 'Paged (left to right)' },
  { value: 'pagedRtl', label: 'Paged (right to left)' },
  { value: 'continuousVertical', label: 'Continuous vertical (webtoon)' },
  { value: 'continuousLtr', label: 'Continuous (left to right)' },
  { value: 'continuousRtl', label: 'Continuous (right to left)' },
];

interface MangaReaderModePanelProps {
  visible: boolean;
  onDismiss: () => void;
  value: ReaderMode;
  onChange: (mode: ReaderMode) => void;
}

/**
 * `ReaderSettingsPanel.tsx`'s slide-in-panel + dropdown-row shape, scoped
 * down to the one setting manga's reader currently has: reading mode.
 * Replaces the old single toggle icon button (paged/vertical only) with
 * all 5 modes `Manga.readerMode` now supports (widened in migration
 * `20260905010000_widen_manga_reader_mode`). Not exported from/added to
 * `ReaderSettingsPanel.tsx` itself — that component's `DropdownRow` and
 * style helpers are file-local, and this panel's needs (one row, no
 * theme/font/margin settings) are narrow enough that duplicating just the
 * slide-in shell is simpler and safer than refactoring the novel reader's
 * internals to share it.
 */
const MangaReaderModePanel: React.FC<MangaReaderModePanelProps> = ({
  visible,
  onDismiss,
  value,
  onChange,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [open, setOpen] = useState(false);

  if (!visible) {
    return null;
  }

  const currentLabel =
    MODE_OPTIONS.find(o => o.value === value)?.label ?? value;

  return (
    <View style={styles.overlay}>
      <AnimatedPressable
        entering={FadeIn.duration(150)}
        exiting={FadeOut.duration(150)}
        style={styles.backdrop}
        onPress={onDismiss}
      />
      <Animated.View
        entering={SlideInRight.duration(220)}
        exiting={SlideOutRight.duration(180)}
        style={[styles.panel, { paddingTop: insets.top + 12 }]}
      >
        <View style={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Reading mode</Text>
            <Menu
              visible={open}
              onDismiss={() => setOpen(false)}
              anchor={
                <Pressable
                  style={styles.dropdownAnchor}
                  android_ripple={{ color: theme.rippleColor }}
                  onPress={() => setOpen(true)}
                >
                  <Text style={styles.dropdownValue}>{currentLabel}</Text>
                  <IconButtonV2
                    name={open ? 'menu-up' : 'menu-down'}
                    theme={theme}
                    size={20}
                    padding={2}
                    color={theme.onSurfaceVariant}
                    onPress={() => setOpen(true)}
                  />
                </Pressable>
              }
            >
              {MODE_OPTIONS.map(opt => (
                <Menu.Item
                  key={opt.value}
                  title={opt.label}
                  onPress={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                />
              ))}
            </Menu>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

export default MangaReaderModePanel;

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      zIndex: 5,
    },
    backdrop: {
      flex: 1,
      backgroundColor: color(theme.backdrop ?? '#000000')
        .alpha(0.32)
        .string(),
    },
    panel: {
      width: '82%',
      maxWidth: 380,
      backgroundColor: theme.surface,
      borderTopLeftRadius: 12,
      borderBottomLeftRadius: 12,
    },
    content: {
      paddingVertical: 8,
    },
    row: {
      minHeight: 56,
      paddingHorizontal: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    rowLabel: {
      color: theme.onSurfaceVariant,
      fontSize: 15,
      flexShrink: 1,
    },
    dropdownAnchor: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    dropdownValue: {
      color: theme.onSurface,
      fontSize: 16,
    },
  });
