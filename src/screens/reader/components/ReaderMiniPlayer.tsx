import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons';

import { useTheme } from '@hooks/persisted';
import { ChapterInfo, NovelInfo } from '@database/types';
import type { useTtsSession } from '../hooks/useTtsSession';

interface ReaderMiniPlayerProps {
  visible: boolean;
  novel: NovelInfo;
  chapter: ChapterInfo;
  tts: ReturnType<typeof useTtsSession>;
  /** Tap the bar to bring the full player back. */
  onExpand: () => void;
}

const ReaderMiniPlayer: React.FC<ReaderMiniPlayerProps> = ({
  visible,
  novel,
  chapter,
  tts,
  onExpand,
}) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!visible) {
    return null;
  }

  const playing = tts.state === 'playing';

  return (
    <Animated.View
      entering={FadeInDown.duration(180)}
      exiting={FadeOutDown.duration(140)}
      style={[styles.bar, { bottom: insets.bottom + 8 }]}
    >
      <Pressable
        style={styles.tap}
        onPress={onExpand}
        accessibilityLabel="Open player"
      >
        {novel.cover ? (
          <Image source={{ uri: novel.cover }} style={styles.cover} />
        ) : (
          <View style={[styles.cover, styles.coverFallback]}>
            <MaterialCommunityIcons
              name="headphones"
              size={18}
              color={theme.onSurfaceVariant}
            />
          </View>
        )}
        <View style={styles.text}>
          <Text style={styles.title} numberOfLines={1}>
            {tts.currentChapterName || chapter.name}
          </Text>
          <Text style={styles.status} numberOfLines={1}>
            {playing ? 'Playing…' : 'Paused'}
          </Text>
        </View>
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => tts.command(playing ? 'pause' : 'play')}
        accessibilityLabel={playing ? 'Pause' : 'Play'}
      >
        <MaterialCommunityIcons
          name={playing ? 'pause' : 'play'}
          size={26}
          color={theme.onSurface}
        />
      </Pressable>
      <Pressable
        style={styles.btn}
        onPress={() => tts.command('stop')}
        accessibilityLabel="Stop"
      >
        <MaterialCommunityIcons
          name="close"
          size={22}
          color={theme.onSurface}
        />
      </Pressable>
    </Animated.View>
  );
};

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    bar: {
      position: 'absolute',
      left: 8,
      right: 8,
      zIndex: 4,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      paddingRight: 4,
      backgroundColor: theme.surfaceVariant,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 2 },
    },
    tap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      padding: 6,
    },
    cover: {
      width: 38,
      height: 52,
      borderRadius: 6,
      backgroundColor: theme.surface,
    },
    coverFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      flex: 1,
      marginLeft: 10,
    },
    title: {
      color: theme.onSurface,
      fontSize: 14,
      fontWeight: '600',
    },
    status: {
      color: theme.onSurfaceVariant,
      fontSize: 12,
      marginTop: 2,
    },
    btn: {
      padding: 8,
    },
  });

export default ReaderMiniPlayer;
