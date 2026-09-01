import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { Dialog } from '@components';
import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { ChapterInfo, NovelInfo } from '@database/types';
import type { useTtsSession } from '../hooks/useTtsSession';
import { SLEEP_MODES, SleepMode, useSleepTimer } from '../hooks/useSleepTimer';

const RATE_STEPS = [0.75, 1, 1.25, 1.5, 1.75, 2];

interface ReaderPlayerScreenProps {
  visible: boolean;
  /** Go back to the reading view — narration keeps playing. */
  onClose: () => void;
  /** Open the full reader TTS settings sheet. */
  onOpenSettings: () => void;
  tts: ReturnType<typeof useTtsSession>;
  novel: NovelInfo;
  chapter: ChapterInfo;
}

const ReaderPlayerScreen: React.FC<ReaderPlayerScreenProps> = ({
  visible,
  onClose,
  onOpenSettings,
  tts,
  novel,
  chapter,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { tts: ttsSettings, setChapterReaderSettings } =
    useChapterReaderSettings();
  const [sleepMode, setSleepMode] = useState<SleepMode>('off');
  const [sleepSheet, setSleepSheet] = useState(false);

  useSleepTimer({
    mode: sleepMode,
    chapterId: tts.progress.chapterId,
    onFire: () => {
      setSleepMode('off');
      tts.command('pause');
    },
  });

  if (!visible) {
    return null;
  }

  const playing = tts.state === 'playing';
  const rate = ttsSettings?.rate ?? 1;
  const chapterName = tts.currentChapterName || chapter.name;

  const cycleRate = () => {
    const i = RATE_STEPS.findIndex(r => Math.abs(r - rate) < 0.01);
    const next = RATE_STEPS[(i + 1) % RATE_STEPS.length];
    // The WebView's MMKV listener forwards this to the native session.
    setChapterReaderSettings({ tts: { ...ttsSettings, rate: next } });
  };

  const sleepLabel =
    SLEEP_MODES.find(m => m.value === sleepMode)?.label ?? 'Off';

  return (
    <Animated.View
      entering={SlideInDown.duration(240)}
      exiting={SlideOutDown.duration(200)}
      style={[
        styles.overlay,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.chapter} numberOfLines={2}>
          {chapterName}
        </Text>
        <Text style={styles.novel} numberOfLines={1}>
          {novel.name}
        </Text>
      </View>

      <View style={styles.chips}>
        <Pressable style={styles.chip} onPress={cycleRate}>
          <Text style={styles.chipText}>{rate.toFixed(rate % 1 ? 2 : 1)}×</Text>
        </Pressable>
        <Pressable style={styles.chip} onPress={() => setSleepSheet(true)}>
          <MaterialCommunityIcons
            name="timer-outline"
            size={16}
            color={theme.onSurfaceVariant}
          />
          <Text style={styles.chipText}>
            {sleepMode === 'off' ? 'Timer' : sleepLabel}
          </Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.captionScroll}
        contentContainerStyle={styles.captionContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.caption}>
          {tts.currentText || (playing ? '…' : 'Paused')}
        </Text>
      </ScrollView>

      <View style={styles.transport}>
        <Pressable
          style={styles.skip}
          onPress={() => tts.command('previous')}
          accessibilityLabel="Previous paragraph"
        >
          <MaterialCommunityIcons
            name="skip-previous"
            size={44}
            color={theme.onSurface}
          />
        </Pressable>
        <Pressable
          style={styles.playPause}
          onPress={() => tts.command(playing ? 'pause' : 'play')}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <MaterialCommunityIcons
            name={playing ? 'pause' : 'play'}
            size={44}
            color={theme.onSurface}
          />
        </Pressable>
        <Pressable
          style={styles.skip}
          onPress={() => tts.command('next')}
          accessibilityLabel="Next paragraph"
        >
          <MaterialCommunityIcons
            name="skip-next"
            size={44}
            color={theme.onSurface}
          />
        </Pressable>
      </View>

      <View style={styles.bottomBar}>
        <Pressable style={styles.bottomAction} onPress={onClose}>
          <MaterialCommunityIcons
            name="book-open-variant"
            size={20}
            color={theme.onSurface}
          />
          <Text style={styles.bottomLabel}>Reader</Text>
        </Pressable>
        <View style={styles.bottomDivider} />
        <Pressable
          style={styles.bottomAction}
          onPress={() => {
            onClose();
            onOpenSettings();
          }}
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={20}
            color={theme.onSurface}
          />
          <Text style={styles.bottomLabel}>Settings</Text>
        </Pressable>
      </View>

      <Dialog.Root visible={sleepSheet} onDismiss={() => setSleepSheet(false)}>
        <Dialog.Title>Sleep timer</Dialog.Title>
        <Dialog.ScrollArea>
          <ScrollView>
            {SLEEP_MODES.map(m => (
              <Pressable
                key={m.value}
                style={styles.sleepRow}
                onPress={() => {
                  setSleepMode(m.value);
                  setSleepSheet(false);
                }}
              >
                <Text style={styles.sleepRowText}>{m.label}</Text>
                {sleepMode === m.value ? (
                  <Text style={[styles.sleepRowText, { color: theme.primary }]}>
                    ✓
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </Dialog.ScrollArea>
        <Dialog.Actions>
          <Dialog.Action onPress={() => setSleepSheet(false)}>
            Close
          </Dialog.Action>
        </Dialog.Actions>
      </Dialog.Root>
    </Animated.View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    overlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.surface,
      zIndex: 6,
      paddingHorizontal: 20,
    },
    header: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    chapter: {
      color: theme.onSurface,
      fontSize: 18,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 24,
    },
    novel: {
      color: theme.onSurfaceVariant,
      fontSize: 14,
      marginTop: 4,
    },
    chips: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 4,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      backgroundColor: theme.surfaceVariant,
    },
    chipText: {
      color: theme.onSurfaceVariant,
      fontSize: 13,
      fontWeight: '600',
    },
    captionScroll: {
      flex: 1,
      marginTop: 12,
    },
    captionContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingVertical: 24,
    },
    caption: {
      color: theme.onSurface,
      fontSize: 22,
      lineHeight: 34,
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 28,
      paddingVertical: 16,
    },
    skip: {
      padding: 8,
    },
    playPause: {
      padding: 8,
      borderRadius: 44,
      borderWidth: 2,
      borderColor: theme.outline,
    },
    bottomBar: {
      flexDirection: 'row',
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.outlineVariant,
      paddingTop: 10,
    },
    bottomAction: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 8,
    },
    bottomLabel: {
      color: theme.onSurface,
      fontSize: 15,
    },
    bottomDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: theme.outlineVariant,
    },
    sleepRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    sleepRowText: {
      color: theme.onSurface,
      fontSize: 16,
    },
  });

export default ReaderPlayerScreen;
