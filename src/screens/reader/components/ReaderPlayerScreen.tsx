import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { useChapterReaderSettings, useTheme } from '@hooks/persisted';
import { ChapterInfo, NovelInfo } from '@database/types';
import { Tts, TtsVoice } from '@modules/nitro-tts';
import { VoicePickerModal } from './ReaderBottomSheet/TTSTab';
import {
  KOKORO_SUPPORTED,
  listInstalledKokoroVoices,
  type InstalledKokoroVoice,
} from '@services/tts/voiceRepository';
import type { useTtsSession } from '../hooks/useTtsSession';
import { SLEEP_MODES, SleepMode, useSleepTimer } from '../hooks/useSleepTimer';

interface ReaderPlayerScreenProps {
  visible: boolean;
  /** Go back to the reading view — narration keeps playing. */
  onClose: () => void;
  /** Open the full reader TTS settings sheet. */
  onOpenSettings: () => void;
  /** Open the chapter list. */
  onOpenContents: () => void;
  tts: ReturnType<typeof useTtsSession>;
  novel: NovelInfo;
  chapter: ChapterInfo;
}

const ReaderPlayerScreen: React.FC<ReaderPlayerScreenProps> = ({
  visible,
  onClose,
  onOpenSettings,
  onOpenContents,
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
  const [voiceSheet, setVoiceSheet] = useState(false);
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  const [kokoroVoices, setKokoroVoices] = useState<InstalledKokoroVoice[]>([]);
  const isKokoro = KOKORO_SUPPORTED && ttsSettings?.engineKind === 'kokoro';

  useSleepTimer({
    mode: sleepMode,
    chapterId: tts.progress.chapterId,
    onFire: () => {
      setSleepMode('off');
      tts.command('pause');
    },
  });

  useEffect(() => {
    if (!voiceSheet) {
      return;
    }
    if (isKokoro) {
      listInstalledKokoroVoices()
        .then(setKokoroVoices)
        .catch(() => setKokoroVoices([]));
    } else {
      Tts.getVoices(ttsSettings?.engine?.name).then(res =>
        setVoices([...res].sort((a, b) => a.name.localeCompare(b.name))),
      );
    }
  }, [voiceSheet, isKokoro, ttsSettings?.engine?.name]);

  const selectVoice = useCallback(
    (voice?: TtsVoice) => {
      if (isKokoro) {
        const picked = kokoroVoices.find(v => v.id === voice?.identifier);
        if (picked) {
          setChapterReaderSettings({
            tts: {
              ...ttsSettings,
              engineKind: 'kokoro',
              kokoroEngineId: picked.engineId,
              kokoroVoiceId: picked.id,
              kokoroSpeakerId: picked.speakerId,
            },
          });
        }
        return;
      }
      setChapterReaderSettings({ tts: { ...ttsSettings, voice } });
    },
    [isKokoro, kokoroVoices, setChapterReaderSettings, ttsSettings],
  );

  if (!visible) {
    return null;
  }

  const playing = tts.state === 'playing';
  const chapterName = tts.currentChapterName || chapter.name;

  // The voice picker (VoicePickerModal) speaks TtsVoice; map Kokoro voices into
  // that shape so the same modal serves both engines.
  const pickerVoices: TtsVoice[] = isKokoro
    ? kokoroVoices.map(v => ({
        identifier: v.id,
        name: v.name,
        language: v.language,
      }))
    : voices;
  const voice: TtsVoice | undefined = isKokoro
    ? ttsSettings?.kokoroVoiceId
      ? {
          identifier: ttsSettings.kokoroVoiceId,
          name:
            kokoroVoices.find(v => v.id === ttsSettings.kokoroVoiceId)?.name ??
            ttsSettings.kokoroVoiceId,
        }
      : undefined
    : ttsSettings?.voice;

  return (
    <Animated.View
      entering={SlideInDown.duration(240)}
      exiting={SlideOutDown.duration(200)}
      style={[
        styles.overlay,
        { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 },
      ]}
    >
      <View style={styles.topRow}>
        <Pressable
          hitSlop={12}
          onPress={onClose}
          accessibilityLabel="Back to reader"
        >
          <MaterialCommunityIcons
            name="chevron-down"
            size={30}
            color={theme.onSurface}
          />
        </Pressable>
        <Pressable
          style={styles.timerBtn}
          onPress={() => setSleepSheet(true)}
          accessibilityLabel="Sleep timer"
        >
          <MaterialCommunityIcons
            name="timer-outline"
            size={18}
            color={sleepMode === 'off' ? theme.onSurfaceVariant : theme.primary}
          />
          {sleepMode !== 'off' ? (
            <Text style={styles.timerText}>
              {SLEEP_MODES.find(m => m.value === sleepMode)?.label}
            </Text>
          ) : null}
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {novel.cover ? (
          <Image
            source={{ uri: novel.cover }}
            style={styles.cover}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <MaterialCommunityIcons
              name="headphones"
              size={64}
              color={theme.onSurfaceVariant}
            />
          </View>
        )}

        <Text style={styles.chapter} numberOfLines={2}>
          {chapterName}
        </Text>
        <Text style={styles.novel} numberOfLines={1}>
          {novel.name}
        </Text>

        <Text style={styles.caption}>
          {tts.currentText || (playing ? '…' : 'Paused')}
        </Text>
        {tts.error ? <Text style={styles.errorText}>{tts.error}</Text> : null}
      </ScrollView>

      <View style={styles.transport}>
        <Pressable
          style={styles.endBtn}
          onPress={onOpenContents}
          accessibilityLabel="Chapter list"
        >
          <MaterialCommunityIcons
            name="format-list-bulleted"
            size={24}
            color={theme.onSurface}
          />
          <Text style={styles.endLabel}>Contents</Text>
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => tts.command('previous')}
          accessibilityLabel="Previous paragraph"
        >
          <MaterialCommunityIcons
            name="skip-previous"
            size={40}
            color={theme.onSurface}
          />
        </Pressable>
        <Pressable
          style={styles.play}
          onPress={() => tts.command(playing ? 'pause' : 'play')}
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <MaterialCommunityIcons
            name={playing ? 'pause' : 'play'}
            size={40}
            color={theme.surface}
          />
        </Pressable>
        <Pressable
          hitSlop={8}
          onPress={() => tts.command('next')}
          accessibilityLabel="Next paragraph"
        >
          <MaterialCommunityIcons
            name="skip-next"
            size={40}
            color={theme.onSurface}
          />
        </Pressable>
        <Pressable
          style={styles.endBtn}
          onPress={() => {
            onClose();
            onOpenSettings();
          }}
          accessibilityLabel="Settings"
        >
          <MaterialCommunityIcons
            name="cog-outline"
            size={24}
            color={theme.onSurface}
          />
          <Text style={styles.endLabel}>Settings</Text>
        </Pressable>
      </View>

      <Pressable style={styles.voiceRow} onPress={() => setVoiceSheet(true)}>
        <Text style={styles.voiceLabel}>Voice</Text>
        <View style={styles.voiceRight}>
          <MaterialCommunityIcons
            name="account-circle"
            size={28}
            color={theme.onSurfaceVariant}
          />
          <View style={styles.voiceMeta}>
            <Text style={styles.voiceName} numberOfLines={1}>
              {voice?.name ?? 'System default'}
            </Text>
            {voice?.language ? (
              <Text style={styles.voiceLang}>{voice.language}</Text>
            ) : null}
          </View>
          <MaterialCommunityIcons
            name="chevron-right"
            size={24}
            color={theme.onSurfaceVariant}
          />
        </View>
      </Pressable>

      <VoicePickerModal
        visible={voiceSheet}
        onDismiss={() => setVoiceSheet(false)}
        voices={pickerVoices}
        currentVoice={voice}
        onSelect={selectVoice}
      />

      {sleepSheet ? (
        <Pressable
          style={styles.sheetBackdrop}
          onPress={() => setSleepSheet(false)}
        >
          <Pressable style={styles.sheet}>
            <Text style={styles.sheetTitle}>Sleep timer</Text>
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
                  <MaterialCommunityIcons
                    name="check"
                    size={20}
                    color={theme.primary}
                  />
                ) : null}
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      ) : null}
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
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 36,
    },
    timerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.outline,
    },
    timerText: {
      color: theme.primary,
      fontSize: 12,
      fontWeight: '600',
    },
    body: {
      alignItems: 'center',
      paddingTop: 16,
      paddingBottom: 8,
      flexGrow: 1,
    },
    cover: {
      width: 220,
      height: 300,
      borderRadius: 16,
      backgroundColor: theme.surfaceVariant,
    },
    coverFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    chapter: {
      color: theme.onSurface,
      fontSize: 26,
      fontWeight: '800',
      textAlign: 'center',
      marginTop: 24,
    },
    novel: {
      color: theme.onSurfaceVariant,
      fontSize: 15,
      textAlign: 'center',
      marginTop: 6,
    },
    caption: {
      color: theme.onSurface,
      fontSize: 20,
      lineHeight: 30,
      marginTop: 20,
      alignSelf: 'stretch',
    },
    errorText: {
      color: theme.error,
      fontSize: 13,
      marginTop: 12,
      alignSelf: 'stretch',
    },
    transport: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
    },
    endBtn: {
      alignItems: 'center',
      gap: 2,
      width: 68,
    },
    endLabel: {
      color: theme.onSurfaceVariant,
      fontSize: 12,
    },
    play: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.onSurface,
    },
    voiceRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: theme.surfaceVariant,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 18,
    },
    voiceLabel: {
      color: theme.onSurface,
      fontSize: 16,
      fontWeight: '700',
    },
    voiceRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flexShrink: 1,
    },
    voiceMeta: {
      alignItems: 'flex-end',
      flexShrink: 1,
    },
    voiceName: {
      color: theme.onSurface,
      fontSize: 15,
      fontWeight: '600',
    },
    voiceLang: {
      color: theme.onSurfaceVariant,
      fontSize: 12,
    },
    sheetBackdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: theme.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 32,
    },
    sheetTitle: {
      color: theme.onSurface,
      fontSize: 18,
      fontWeight: '700',
      marginBottom: 8,
      paddingHorizontal: 4,
    },
    sleepRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
      paddingHorizontal: 4,
    },
    sleepRowText: {
      color: theme.onSurface,
      fontSize: 16,
    },
  });

export default ReaderPlayerScreen;
