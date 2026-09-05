import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import NovelCoverImage from './NovelCoverImage';
import { getUserAgent } from '@hooks/persisted/useUserAgent';
import { getString } from '@i18n/translations';
import type { ImageRequestInit } from '@plugins/types';
import type { ThemeColors } from '@theme/types';

/**
 * Manga's `NovelCover.tsx` mirror, deliberately smaller: no display-mode
 * variants (list/compact/comfortable) or download/unread badges yet — those
 * hang off novel-specific settings/contexts (`NovelCoverLayoutContext`,
 * `DisplayModes`) this phase has no equivalent for. Reuses
 * `NovelCoverImage` as-is; it's already content-agnostic.
 */
interface MangaCoverItem {
  name: string;
  cover?: string | null;
}

interface MangaCoverProps<TManga extends MangaCoverItem> {
  item: TManga;
  onPress: () => void;
  onLongPress?: (item: TManga) => void;
  libraryStatus?: boolean;
  theme: ThemeColors;
  width: number;
  height: number;
  imageRequestInit?: ImageRequestInit;
}

function MangaCover<TManga extends MangaCoverItem>({
  item,
  onPress,
  onLongPress,
  libraryStatus,
  theme,
  width,
  height,
  imageRequestInit,
}: MangaCoverProps<TManga>) {
  const requestInit = useMemo<ImageRequestInit>(
    () => ({
      ...imageRequestInit,
      headers: imageRequestInit?.headers || { 'User-Agent': getUserAgent() },
    }),
    [imageRequestInit],
  );

  return (
    <View style={[styles.container, { width }]}>
      <Pressable
        android_ripple={{ color: theme.rippleColor }}
        style={styles.pressable}
        onPress={onPress}
        onLongPress={onLongPress ? () => onLongPress(item) : undefined}
      >
        {libraryStatus ? (
          <Text
            style={[
              styles.inLibraryBadge,
              { backgroundColor: theme.primary, color: theme.onPrimary },
            ]}
          >
            {getString('novelScreen.inLibaray')}
          </Text>
        ) : null}
        <NovelCoverImage
          uri={item.cover}
          requestInit={requestInit}
          theme={theme}
          iconSize={36}
          style={[
            { height },
            styles.borderRadius,
            libraryStatus && styles.dimmed,
          ]}
        />
        <View style={styles.titleContainer}>
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.linearGradient}
          >
            <Text numberOfLines={2} style={styles.title}>
              {item.name}
            </Text>
          </LinearGradient>
        </View>
      </Pressable>
    </View>
  );
}

export default memo(MangaCover) as typeof MangaCover;

const styles = StyleSheet.create({
  borderRadius: { borderRadius: 4 },
  container: { borderRadius: 6, margin: 2, overflow: 'hidden' },
  dimmed: { opacity: 0.5 },
  inLibraryBadge: {
    borderRadius: 4,
    fontSize: 12,
    left: 10,
    paddingHorizontal: 4,
    paddingVertical: 2,
    position: 'absolute',
    top: 10,
    zIndex: 1,
  },
  linearGradient: { borderRadius: 4 },
  pressable: { borderRadius: 4, flex: 1, padding: 4.8 },
  title: {
    color: 'rgba(255,255,255,1)',
    fontFamily: 'pt-sans-bold',
    fontSize: 14,
    padding: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  titleContainer: {
    borderRadius: 4,
    bottom: 4,
    left: 4,
    position: 'absolute',
    right: 4,
  },
});
